import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Actor } from "@/core/actor";
import type { Db } from "@/core/db/client";
import { BLOCK_TYPES, CHANGE_SET_KINDS, DOCUMENT_KINDS, VISIBILITIES } from "@/core/db/schema";
import { GalleyError, notFound } from "@/core/errors";
import { describeComponents } from "@/core/markup/components";
import { logAgentCall } from "@/core/services/agents";
import { createBlock, markBlockStale, proposeBlockUpdate, readBlockAsAgent, searchBlocks } from "@/core/services/blocks";
import { listCategories } from "@/core/services/categories";
import { changeSetContents, findChangeSet, openChangeSet, submitChangeSet, withdrawChangeSet } from "@/core/services/changeSets";
import { getDocumentForEditing, saveDocument } from "@/core/services/documents";
import { getNextTasks } from "@/core/services/tasks";
import { getSkill, listSkills } from "@/core/skills";

type AgentActor = Extract<Actor, { kind: "agent" }>;

const INSTRUCTIONS = [
  "这是 Galley 博客的运营接口。你负责准备内容，站长负责审阅和批准，你不能发布。",
  "开始工作前，先调用 get_skill 读取 overview 技能，再调用 get_next_tasks 查看待办。",
  "写文章或整理知识块之前，先读取 writing 技能。",
].join("\n");

const sourceShape = z.object({
  url: z.string().describe("来源链接"),
  title: z.string().optional(),
  quote: z.string().optional().describe("来源里支持该说法的原文摘录"),
  accessedAt: z.string().optional().describe("访问日期，例如 2026-11-12"),
});

/**
 * 为一个已认证的 Agent 创建 MCP 服务。
 *
 * 这里的每个工具都只是核心层的外壳，权限规则在核心层判断。
 * 这里没有、也不应该有：批准、发布、下线、读取留言、修改技能、修改权限。
 */
export function createMcpServer(
  db: Db,
  actor: AgentActor,
  hooks: { /** 线上内容的显示发生了变化，需要刷新页面缓存 */ onPublicChange?: () => void } = {},
): McpServer {
  const server = new McpServer({ name: "galley", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    handler: (args: z.infer<z.ZodObject<S>>) => unknown,
  ) {
    server.registerTool(name, { description, inputSchema: shape }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        const result = handler(args);
        logAgentCall(db, actor.id, name);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        const known = e instanceof GalleyError;
        if (!known) console.error(`[mcp] ${name} failed`, e);
        const message = known ? e.message : "服务端内部错误，请稍后重试。";
        logAgentCall(db, actor.id, name, message);
        return { isError: true, content: [{ type: "text" as const, text: message }] };
      }
    }) as never);
  }

  // ---- 入门 ----
  tool("get_next_tasks", "查看当前的待办：被打回的变更集、需要修订的过期引用、没做完的变更集。每次运行先调用它。", {}, () =>
    getNextTasks(db, actor),
  );

  tool("list_skills", "列出站点提供的技能（运营说明）。", {}, () => listSkills());

  tool("get_skill", "读取一个技能的完整内容。", { name: z.string().describe("技能名，例如 overview、writing") }, ({ name }) => {
    const skill = getSkill(name);
    if (!skill) throw notFound(`技能 ${name} 不存在。可用的技能：${listSkills().map((s) => s.name).join("、")}。`);
    return skill;
  });

  tool("list_components", "列出正文里可以使用的组件及其参数。", {}, () => describeComponents());

  tool("list_categories", "列出站点的分类。每篇文章都要归入其中一个；新分类只能由站长在后台创建。", {}, () =>
    listCategories(db).map((c) => ({ slug: c.slug, name: c.name, publishedCount: c.publishedCount })),
  );

  // ---- 变更集 ----
  tool(
    "open_change_set",
    "开启一个变更集。你的一切修改都要在某个变更集里进行，最后提交给站长审阅。",
    {
      kind: z.enum(CHANGE_SET_KINDS).describe("article 新文章；document_edit 修改已有文章；page 页面调整；knowledge 整理知识块；block_update 更新知识块及受影响的文章"),
      title: z.string().describe("一句话说明这次要做什么，站长会在看板上看到"),
      summary: z.string().optional().describe("补充说明：为什么做、做了哪些取舍"),
    },
    (args) => {
      const cs = openChangeSet(db, actor, args);
      return { changeSetId: cs.id, status: cs.status };
    },
  );

  tool("get_change_set", "查看一个变更集的状态、站长的意见和其中的内容。", { changeSetId: z.string() }, ({ changeSetId }) => {
    const { changeSet, blockItems, documentItems } = changeSetContents(db, changeSetId);
    if (changeSet.createdById !== actor.id) throw notFound(`变更集 ${changeSetId} 不存在。`);
    return {
      changeSetId: changeSet.id,
      kind: changeSet.kind,
      title: changeSet.title,
      status: changeSet.status,
      ownerNote: changeSet.decisionNote,
      blocks: blockItems.map(({ block, revision }) => ({
        blockId: block.id,
        type: block.type,
        title: revision.title,
        isNew: revision.revNo === 1,
      })),
      documents: documentItems.map(({ document, revision }) => ({
        documentId: document.id,
        slug: document.slug,
        title: revision.title,
        isNew: revision.revNo === 1,
      })),
    };
  });

  tool("submit_change_set", "把变更集提交给站长审阅。提交后不能再修改，除非被打回。", { changeSetId: z.string() }, ({ changeSetId }) => {
    const cs = submitChangeSet(db, actor, changeSetId);
    return { changeSetId: cs.id, status: cs.status };
  });

  tool("withdraw_change_set", "撤回一个不再需要的变更集，释放它占用的知识块和文档。", { changeSetId: z.string() }, ({ changeSetId }) => {
    const cs = withdrawChangeSet(db, actor, changeSetId);
    return { changeSetId: cs.id, status: cs.status };
  });

  // ---- 知识库 ----
  tool(
    "search_blocks",
    "搜索站里已经确认的知识块。写作前先搜索，已有的内容直接引用。多个词用空格分开，每个词都要出现。",
    {
      query: z.string().describe("搜索词。留空返回最近的知识块"),
      type: z.enum(BLOCK_TYPES).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    ({ query, type, limit }) =>
      // 私密知识块的正文不出现在搜索结果里，完整内容要通过 get_block 读取，那里会留下读取记录。
      searchBlocks(db, query, { type, limit }).map((b) =>
        b.visibility === "private" ? { ...b, body: "（私密知识块，用 get_block 读取）" } : b,
      ),
  );

  tool(
    "get_block",
    "读取一个知识块的完整内容，以及它被哪些已发布的文章引用。",
    { blockId: z.string(), changeSetId: z.string().optional().describe("给出时优先返回该变更集里的草稿版本") },
    ({ blockId, changeSetId }) => {
      if (changeSetId && findChangeSet(db, changeSetId).createdById !== actor.id) {
        throw notFound(`变更集 ${changeSetId} 不存在。`);
      }
      return readBlockAsAgent(db, actor, blockId, changeSetId);
    },
  );

  tool(
    "create_block",
    "在变更集里新建一个知识块。发现相似的已有块时不会创建，而是把它们返回给你判断。",
    {
      changeSetId: z.string(),
      type: z.enum(BLOCK_TYPES),
      title: z.string().describe("一句话标签"),
      body: z.string().describe("知识块正文，简短、独立可读"),
      data: z.record(z.string(), z.unknown()).optional().describe("类型专有字段，见 writing 技能"),
      sources: z.array(sourceShape).optional().describe("来源。fact 和 data 类型至少需要一个"),
      visibility: z.enum(VISIBILITIES).optional().describe("默认 public。private 的知识块不能被公开内容引用"),
      confirmNew: z.boolean().optional().describe("已经看过相似的块，确认这是新内容"),
    },
    (args) => createBlock(db, actor, args),
  );

  tool(
    "propose_block_update",
    "在变更集里提议更新一个知识块，返回所有受影响的文章位置。只传需要修改的字段。",
    {
      changeSetId: z.string(),
      blockId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
      sources: z.array(sourceShape).optional(),
      semanticChange: z.boolean().optional().describe("只是修正错别字或补充来源、不改变含义时设为 false"),
      reason: z.string().describe("为什么要更新"),
    },
    (args) => proposeBlockUpdate(db, actor, args),
  );

  tool(
    "mark_block_stale",
    "把一个知识块标记为可能已过期。引用它的文章会在后台被标出，并出现在待办里。",
    { blockId: z.string() },
    ({ blockId }) => {
      const result = markBlockStale(db, actor, blockId);
      hooks.onPublicChange?.();
      return result;
    },
  );

  // ---- 文档 ----
  tool(
    "save_document",
    "在变更集里保存文章或页面。正文有错误时不会保存，并返回具体的错误供你修正。",
    {
      changeSetId: z.string(),
      documentId: z.string().optional().describe("修改已有文档时给出"),
      kind: z.enum(DOCUMENT_KINDS).optional().describe("新建时必填"),
      slug: z.string().optional().describe("新建时必填。网址别名，小写字母、数字和连字符"),
      title: z.string(),
      summary: z.string().optional().describe("一两句话的摘要，显示在文章列表里"),
      category: z.string().optional().describe("分类的网址别名，见 list_categories。新文章必须给出；修改文章时省略表示不变"),
      body: z.string().describe("正文，Markdown 加引用标记，语法见 writing 技能"),
    },
    (args) => saveDocument(db, actor, args),
  );

  tool(
    "get_document",
    "读取一篇文档的正文。给出变更集时优先返回其中的草稿，否则返回线上的版本。",
    { documentId: z.string().optional(), slug: z.string().optional(), changeSetId: z.string().optional() },
    ({ documentId, slug, changeSetId }) => getDocumentForEditing(db, { documentId, slug }, changeSetId),
  );

  return server;
}
