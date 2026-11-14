import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { narrationEditSchema } from "../core/studio-guides";
import type { Actor } from "../core/actor";
import { GalleyError, notFound } from "../core/errors";
import { disabledToolsOf, listAgents, logAgentCall } from "../core/services/agents";
import { getSkill } from "../core/services/skills";
import { findTool } from "../core/tools";
import type { StudioRuntime } from "../../integrations/video-studio/runtime";

const project = { projectId: z.string(), revisionId: z.string().describe("刚读取的当前版本 ID，用于防止覆盖其他修改") };
const stage = z.enum(["script", "video"]);
const readOnly = new Set(["studio_get_skill", "studio_list_articles", "studio_list_projects", "studio_get_project", "studio_get_export"]);
export function createStudioMcp(runtime: StudioRuntime, actor: Extract<Actor, { kind: "agent" }>) {
  const server = new McpServer({ name: "galley-studio", version: "0.2.0" }, { instructions: "这是本机 Galley 视频工坊。先 studio_get_skill 读取当前制作技能，再用 studio_list_projects / studio_get_project 查看项目、当前版本与批注。讲稿、聚焦和镜头共用版本与审查流程；修改须带刚读取的 revisionId。配音和导出是异步任务，需要读取状态直到完成或明确失败。studio_publish_project 仅向获站长直接定稿授权的 Agent 开放，操作标明未经人工审阅；没有授权时用 studio_submit_review 送审。定稿不会发布线上文章或上传视频平台。" });
  const disabled = disabledToolsOf(runtime.db, actor.id);
  const canPublish = listAgents(runtime.db).find((item) => item.id === actor.id)?.canPublish;
  function tool<S extends z.ZodRawShape>(name: string, inputSchema: S, handler: (args: z.infer<z.ZodObject<S>>) => unknown) {
    const info = findTool(name);
    if (!info || info.surface !== "studio") throw new Error(`未登记 Studio 工具：${name}`);
    if (disabled.has(name) || (name === "studio_publish_project" && !canPublish)) return;
    server.registerTool(name, { description: info.label, inputSchema, annotations: { readOnlyHint: readOnly.has(name), destructiveHint: false, openWorldHint: false } }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        const result = await handler(args); logAgentCall(runtime.db, actor.id, name);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof GalleyError ? error.message : error instanceof Error ? error.message : "操作失败。";
        logAgentCall(runtime.db, actor.id, name, message);
        return { isError: true, content: [{ type: "text" as const, text: message }] };
      }
    }) as never);
  }
  tool("studio_get_skill", {}, () => {
    const skill = getSkill(runtime.db, "studio");
    if (!skill) throw notFound("视频制作技能不存在，请检查工坊的 skills/studio/SKILL.md。");
    return { name: skill.name, description: skill.description, content: skill.content };
  });
  tool("studio_list_articles", {}, () => runtime.articles());
  tool("studio_list_projects", {}, () => runtime.projects.list(actor));
  tool("studio_get_project", { projectId: z.string() }, ({ projectId }) => runtime.projects.get(actor, projectId));
  tool("studio_create_project", { slug: z.string(), name: z.string().min(1).max(120) }, ({ slug, name }) => runtime.create(actor, slug, name, null));
  tool("studio_update_narration", { ...project, edits: z.array(narrationEditSchema).max(2000), note: z.string().max(2000) }, ({ projectId, revisionId, edits, note }) => runtime.projects.revise(actor, projectId, revisionId, edits, note));
  tool("studio_sync_source", project, ({ projectId, revisionId }) => runtime.sync(actor, projectId, revisionId));
  tool("studio_submit_review", { ...project, stage }, ({ projectId, revisionId, stage }) => runtime.projects.submit(actor, projectId, revisionId, stage, stage === "video" ? runtime.sample(actor, projectId, revisionId) : undefined));
  tool("studio_withdraw_review", { ...project, stage }, ({ projectId, revisionId, stage }) => runtime.projects.withdraw(actor, projectId, revisionId, stage));
  tool("studio_reply_comment", { projectId: z.string(), commentId: z.string(), reply: z.string().min(1).max(2000) }, ({ projectId, commentId, reply }) => runtime.projects.reply(actor, projectId, commentId, reply));
  tool("studio_generate_voices", { ...project, forceIds: z.array(z.string()).max(2000).default([]).describe("仅在需要重新生成某拍声音时填写拍点 ID") }, ({ projectId, revisionId, forceIds }) => runtime.generate(actor, projectId, revisionId, forceIds));
  tool("studio_render_video", { ...project, name: z.string().min(1).max(120) }, ({ projectId, revisionId, name }) => runtime.render(actor, projectId, revisionId, name));
  tool("studio_get_export", { exportId: z.string() }, ({ exportId }) => {
    const job = runtime.exportList(actor).find((item) => item.id === exportId);
    if (!job) throw notFound("没有找到你可以读取的导出。");
    return { ...job, files: job.state === "done" ? { video: `/api/exports/${job.id}/video`, subtitles: `/api/exports/${job.id}/subtitles` } : null };
  });
  tool("studio_cancel_export", { exportId: z.string() }, ({ exportId }) => runtime.cancel(actor, exportId));
  tool("studio_publish_project", { ...project, stage, note: z.string().max(2000) }, ({ projectId, revisionId, stage, note }) => runtime.projects.publish(actor, projectId, revisionId, stage, note, stage === "video" ? runtime.sample(actor, projectId, revisionId) : undefined));
  return server;
}
