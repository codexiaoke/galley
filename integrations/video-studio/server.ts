/** 本机 Studio：管理界面使用站长会话；MCP 使用独立 Agent 密钥。 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { narrationEditSchema } from "../../src/core/studio-guides";
import { OWNER } from "../../src/core/actor";
import { GalleyError, invalid, notFound } from "../../src/core/errors";
import { StudioAccess, STUDIO_COOKIE, requireStudioOwner } from "../../src/core/studio-access";
import { StudioExportError } from "../../src/core/studio-exports";
import { authenticateAgent, createAgent, listAgents, recentAgentCalls, regenerateAgentToken, setAgentCanPublish, setAgentDisabled, setAgentDisabledTools } from "../../src/core/services/agents";
import { toolsFor } from "../../src/core/tools";
import { createStudioMcp } from "../../src/mcp/studio";
import { buildStudio } from "./build";
import { StudioRuntime } from "./runtime";

const PORT = Number(process.env.STUDIO_PORT ?? 4321);
const HOST = z.enum(["127.0.0.1", "0.0.0.0"]).parse(process.env.STUDIO_HOST ?? "127.0.0.1");
const WORK_DIR = process.env.STUDIO_DIR ?? path.join(homedir(), "galley-studio");
const HERE = path.dirname(new URL(import.meta.url).pathname);
const runtime = new StudioRuntime(WORK_DIR);
const access = new StudioAccess(WORK_DIR);
let assets: ReturnType<typeof buildStudio> | undefined;
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
};
async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += (chunk as Buffer).length; if (size > 2_000_000) throw invalid("请求太大了。"); chunks.push(chunk as Buffer); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw invalid("请求必须是 JSON。"); }
}
async function input<S extends z.ZodType>(req: IncomingMessage, schema: S): Promise<z.infer<S>> {
  const result = schema.safeParse(await body(req));
  if (!result.success) throw invalid("请求参数不完整或格式不正确。", result.error.flatten());
  return result.data;
}
const revision = { revisionId: z.string().min(1) };
const stage = z.enum(["script", "video"]);
const name = z.string().trim().min(1).max(120);
function streamFile(req: IncomingMessage, res: ServerResponse, file: string, type: string, name: string, inline: boolean) {
  const size = statSync(file).size;
  const headers: Record<string, string | number> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}` };
  let start = 0;
  let end = size - 1;
  if (req.headers.range) {
    const match = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) return void res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) return void res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(req.headers.range ? 206 : 200, { ...headers, "Content-Length": end - start + 1 });
  createReadStream(file, { start, end }).on("error", (error) => res.destroy(error)).pipe(res);
}

const server = createServer(async (req, res) => {
  const host = req.headers.host;
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) return json(res, 403, { error: "只接受本机地址。" });
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) return json(res, 403, { error: "不接受跨站请求。" });
  const url = new URL(req.url ?? "/", `http://${host}`);
  const route = url.pathname;
  try {
    if (req.method === "GET" && route === "/healthz") return json(res, 200, { ok: true });
    if (req.method === "GET" && route === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" });
      return void res.end(readFileSync(path.join(HERE, "index.html")));
    }
    if (req.method === "GET" && ["/studio.js", "/studio.css"].includes(route)) {
      const bundle = await (assets ??= buildStudio(HERE)); const script = route.endsWith(".js");
      res.writeHead(200, { "Content-Type": script ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8", "Cache-Control": "no-store" });
      return void res.end(script ? bundle.js : bundle.css);
    }
    if (route === "/favicon.ico") return void res.writeHead(204).end();
    if (route === "/api/session") {
      if (req.method === "GET") return json(res, 200, { authenticated: access.isOwner(req.headers.cookie ?? "") });
      if (req.method === "POST") {
        const { token } = await input(req, z.object({ token: z.string().max(200) }));
        const cookie = access.login(token);
        if (!cookie) return json(res, 401, { error: "管理密钥无效，请运行 pnpm studio:open 打开管理入口。" });
        res.setHeader("Set-Cookie", `${STUDIO_COOKIE}=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600`);
        return json(res, 200, { authenticated: true });
      }
    }
    const authorization = req.headers.authorization;
    const agent = authorization?.startsWith("Bearer ") ? authenticateAgent(runtime.db, authorization.slice(7).trim()) : null;
    // 一旦提供 Bearer 就只按该身份认证，不能借浏览器已有的站长会话升级权限。
    const actor = authorization ? agent : access.isOwner(req.headers.cookie ?? "") ? OWNER : null;
    if (route === "/mcp") {
      if (!agent) { res.setHeader("WWW-Authenticate", "Bearer"); return json(res, 401, { error: "Studio Agent 密钥无效或已停用。" }); }
      if (req.method !== "POST") return json(res, 405, { error: "MCP 只接受 POST 请求。" });
      const mcp = createStudioMcp(runtime, agent);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { void transport.close(); void mcp.close(); });
      await mcp.connect(transport); await transport.handleRequest(req, res, await body(req)); return;
    }
    if (!actor) return json(res, 401, { error: "请先打开工坊管理入口。" });
    const exportRoute = route.match(/^\/api\/exports\/([a-f0-9-]+)(?:\/(video|subtitles|cancel))?$/);
    if (exportRoute && req.method === "GET" && ["video", "subtitles"].includes(exportRoute[2])) {
      const job = runtime.exports.get(exportRoute[1]); runtime.projects.checkExportAccess(actor, job);
      const kind = exportRoute[2] as "video" | "subtitles";
      return streamFile(req, res, runtime.exports.file(job.id, kind), kind === "video" ? "video/mp4" : "text/plain; charset=utf-8", `${job.name}.${kind === "video" ? "mp4" : "srt"}`, url.searchParams.get("inline") === "1");
    }
    if (req.method === "GET" && route.startsWith("/audio/")) {
      runtime.projects.checkAudioAccess(actor, route); const file = runtime.voice.file(route);
      if (!existsSync(file)) throw notFound("配音文件不存在，请重新生成。");
      return streamFile(req, res, file, "audio/wav", path.basename(file), true);
    }
    requireStudioOwner(actor);
    if (route === "/api/config") {
      if (req.method === "GET") return json(res, 200, runtime.config());
      if (req.method === "PATCH") { const data = await input(req, z.object({ url: z.string(), token: z.string() })); await runtime.connect(actor, data.url, data.token); return json(res, 200, runtime.config()); }
    }
    if (req.method === "GET" && route === "/api/articles") return json(res, 200, await runtime.articles());
    if (route === "/api/projects") {
      if (req.method === "GET") return json(res, 200, runtime.projects.list(actor));
      if (req.method === "POST") { const data = await input(req, z.object({ slug: z.string(), name, assignedAgentId: z.string().nullable().default(null) })); return json(res, 201, await runtime.create(actor, data.slug, data.name, data.assignedAgentId)); }
    }
    const projectRoute = route.match(/^\/api\/projects\/([a-z0-9]+)(?:\/(revise|sync|submit|withdraw|decide|comments|reply|voices|render))?$/);
    if (projectRoute) {
      const [, id, operation] = projectRoute;
      if (req.method === "GET" && !operation) return json(res, 200, runtime.projects.get(actor, id));
      if (req.method === "PATCH" && !operation) { const data = await input(req, z.object({ name, assignedAgentId: z.string().nullable() })); return json(res, 200, runtime.projects.configure(actor, id, data.name, data.assignedAgentId)); }
      if (req.method === "POST") {
        if (operation === "revise") { const data = await input(req, z.object({ ...revision, edits: z.array(narrationEditSchema).max(2000), note: z.string().max(2000) })); return json(res, 200, runtime.projects.revise(actor, id, data.revisionId, data.edits, data.note)); }
        if (operation === "sync") { const data = await input(req, z.object(revision)); return json(res, 200, await runtime.sync(actor, id, data.revisionId)); }
        if (operation === "submit" || operation === "withdraw") { const data = await input(req, z.object({ ...revision, stage })); return json(res, 200, operation === "submit" ? runtime.projects.submit(actor, id, data.revisionId, data.stage, data.stage === "video" ? runtime.sample(actor, id, data.revisionId) : undefined) : runtime.projects.withdraw(actor, id, data.revisionId, data.stage)); }
        if (operation === "decide") { const data = await input(req, z.object({ ...revision, stage, decision: z.enum(["approve", "reject"]), note: z.string().max(2000) })); return json(res, 200, runtime.projects.decide(actor, id, data.revisionId, data.stage, data.decision, data.note, data.stage === "video" ? runtime.sample(actor, id, data.revisionId) : undefined)); }
        if (operation === "comments") { const data = await input(req, z.object({ ...revision, stage, beatId: z.string().optional(), timeMs: z.number().optional(), body: z.string() })); return json(res, 201, runtime.projects.addComment(actor, id, data.revisionId, data)); }
        if (operation === "reply") { const data = await input(req, z.object({ commentId: z.string(), reply: z.string() })); return json(res, 200, runtime.projects.reply(actor, id, data.commentId, data.reply)); }
        if (operation === "voices") { const data = await input(req, z.object({ ...revision, forceIds: z.array(z.string()).default([]) })); return json(res, 202, runtime.generate(actor, id, data.revisionId, data.forceIds)); }
        if (operation === "render") { const data = await input(req, z.object({ ...revision, name })); return json(res, 202, await runtime.render(actor, id, data.revisionId, data.name)); }
      }
    }
    if (req.method === "GET" && route === "/api/exports") return json(res, 200, { exports: runtime.exportList(actor) });
    if (exportRoute) {
      const job = runtime.exports.get(exportRoute[1]);
      if (req.method === "GET" && !exportRoute[2]) return json(res, 200, job);
      if (req.method === "POST" && exportRoute[2] === "cancel") return json(res, 200, runtime.cancel(actor, job.id));
      if (req.method === "PATCH" && !exportRoute[2]) { const data = await input(req, z.object({ name })); return json(res, 200, runtime.exports.rename(job.id, data.name)); }
      if (req.method === "DELETE" && !exportRoute[2]) { runtime.projects.checkExportRemoval(actor, job); runtime.exports.remove(job.id); return json(res, 200, { ok: true }); }
    }
    if (route === "/api/agents") {
      if (req.method === "GET") return json(res, 200, { agents: listAgents(runtime.db), tools: toolsFor("studio"), calls: recentAgentCalls(runtime.db) });
      if (req.method === "POST") { const data = await input(req, z.object({ name })); return json(res, 201, createAgent(runtime.db, actor, data.name)); }
    }
    const agentRoute = route.match(/^\/api\/agents\/([a-z0-9]+)(?:\/(token))?$/);
    if (agentRoute) {
      if (req.method === "POST" && agentRoute[2] === "token") return json(res, 200, regenerateAgentToken(runtime.db, actor, agentRoute[1]));
      if (req.method === "PATCH") {
        const data = await input(req, z.object({ disabled: z.boolean(), canPublish: z.boolean(), disabledTools: z.array(z.string()) }));
        runtime.db.transaction(() => { setAgentCanPublish(runtime.db, actor, agentRoute[1], data.canPublish); setAgentDisabled(runtime.db, actor, agentRoute[1], data.disabled); setAgentDisabledTools(runtime.db, actor, agentRoute[1], data.disabledTools); });
        return json(res, 200, { ok: true });
      }
    }
    if (req.method === "POST" && route === "/api/unload") { await runtime.unload(actor); return json(res, 200, { ok: true }); }
    json(res, 404, { error: "没有这个地址。" });
  } catch (error) {
    const status = error instanceof StudioExportError ? error.status : error instanceof GalleyError ? ({ forbidden: 403, not_found: 404, conflict: 409, invalid: 400 }[error.code]) : 500;
    if (!res.headersSent) json(res, status, { error: error instanceof Error ? error.message : "操作失败。" }); else res.end();
  }
});
server.listen(PORT, HOST, () => {
  console.log(`Galley 视频工坊：http://localhost:${PORT}（运行 pnpm studio:open 打开管理入口）`);
  console.log(`文件位置：${WORK_DIR}`);
});
const shutdown = () => { runtime.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500); };
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
