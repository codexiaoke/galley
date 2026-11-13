import { prepareBody } from "@/core/prepare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Actor } from "@/core/actor";
import type { Db } from "@/core/db/client";
import { BLOCK_TYPES, CHANGE_SET_KINDS, DOCUMENT_KINDS, VISIBILITIES } from "@/core/db/schema";
import { GalleyError, invalid, notFound } from "@/core/errors";
import { describeComponents } from "@/core/markup/components";
import { disabledToolsOf, logAgentCall } from "@/core/services/agents";
import { createBlock, markBlockStale, proposeBlockUpdate, readBlockAsAgent, searchBlocks } from "@/core/services/blocks";
import { listCategories } from "@/core/services/categories";
import { changeSetContents, findChangeSet, openChangeSet, publishChangeSet, submitChangeSet, withdrawChangeSet } from "@/core/services/changeSets";
import { checkDocumentBody, getDocumentForEditing, listDocuments, replaceInDocument, saveDocument } from "@/core/services/documents";
import { lineOfQuote, listComments, replyToComment } from "@/core/services/comments";
import { listMedia, saveMedia } from "@/core/services/media";
import { addMaterial, getMaterial, listMaterials, markMaterialProcessed } from "@/core/services/materials";
import { getNextTasks } from "@/core/services/tasks";
import { claimTopic, createTopic, listTopics } from "@/core/services/topics";
import { getSkill, listSkills, suggestSkillChange } from "@/core/services/skills";
import { readerStats } from "@/core/services/analytics";
import { listTags } from "@/core/services/tags";
import { findTool } from "@/core/tools";

type AgentActor = Extract<Actor, { kind: "agent" }>;

/**
 * 只读的工具。
 *
 * 每个工具都要告诉 Agent 产品自己会不会改动数据。Codex 这类产品默认对"没说明的工具"一律要求人工批准，
 * 在无人值守的定时运行里这等于直接拒绝，Agent 连技能都读不到。
 * 标明只读之后，读取类的调用可以直接放行；写入类的调用是否放行，由使用者在 Agent 产品里决定。
 */
const READ_ONLY_TOOLS = new Set([
  "get_next_tasks",
  "list_skills",
  "get_skill",
  "list_components",
  "get_component",
  "list_categories",
  "list_tags",
  "get_change_set",
  "search_blocks",
  "get_block",
  "get_document",
  "list_materials",
  "list_topics",
  "list_documents",
  "list_media",
  "get_analytics",
]);

/** 每个服务实例实际注册了哪些工具。测试用它来确认工具清单和开关是否生效。 */
const REGISTERED = new WeakMap<McpServer, string[]>();
export const registeredTools = (server: McpServer): string[] => REGISTERED.get(server) ?? [];

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
  // 站长对这个 Agent 关掉的工具：不注册，它的工具列表里就没有。
  const disabled = disabledToolsOf(db, actor.id);
  const registered: string[] = [];
  REGISTERED.set(server, registered);

  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    handler: (args: z.infer<z.ZodObject<S>>) => unknown,
  ) {
    // 每个工具都要先登记在核心层的清单里：站长在后台按这份清单开关工具，漏登记的工具就管不到。
    if (!findTool(name)) throw new Error(`工具 ${name} 没有登记在 core/tools.ts 里。`);
    if (disabled.has(name)) return;
    registered.push(name);
    const annotations = READ_ONLY_TOOLS.has(name)
      ? { readOnlyHint: true, openWorldHint: false }
      : // 写入类的工具都只是在变更集里追加内容，不会删除或覆盖已上线的东西，也不访问站点以外的系统。
        { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
    server.registerTool(name, { description, inputSchema: shape, annotations }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        const result = await handler(args);
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
  tool(
    "get_next_tasks",
    "查看当前的待办：被打回的变更集、需要修订的过期引用、没做完的变更集。每次运行先调用它。已经提交了修订、正在等结论的不算待办，列在 staleCitationsBeingRevised 里仅供知悉。",
    {},
    () => getNextTasks(db, actor),
  );

  tool("list_skills", "列出站点提供的技能（运营说明）。", {}, () => listSkills(db).map((s) => ({ name: s.name, description: s.description })));

  tool("get_skill", "读取一个技能的完整内容。", { name: z.string().describe("技能名，例如 overview、writing") }, ({ name }) => {
    const skill = getSkill(db, name);
    if (!skill) throw notFound(`技能 ${name} 不存在。可用的技能：${listSkills(db).map((s) => s.name).join("、")}。`);
    return { name: skill.name, description: skill.description, content: skill.content };
  });

  tool(
    "suggest_skill_change",
    "对某个技能提出修改建议：哪里应该改、为什么。你不能直接修改技能，建议要等站长看过之后由他决定。适合的时机：同一类问题被打回了不止一次，或者技能里的说明和工具的实际行为对不上。",
    {
      skill: z.string().describe("技能名，例如 writing"),
      suggestion: z.string().describe("建议改成什么，或者加上什么。写具体，最好给出可以直接放进技能里的句子"),
      reason: z.string().optional().describe("为什么需要改：遇到了什么情况"),
    },
    (args) => suggestSkillChange(db, actor, args),
  );

  tool("list_components", "列出正文里可以使用的组件：名字、用途和一个例子。要用某个组件前，用 get_component 读它的详细说明。", {}, () =>
    describeComponents().map(({ name, form, description, example }) => ({ name, form, description, example })),
  );

  tool(
    "get_component",
    "读一个组件的详细说明：参数和可选值，以及更长的清单（比如 algo 的全部算法、trace 里能调用的函数）。用某个组件之前先读一遍。",
    { name: z.string().describe("组件名，例如 algo、trace、code-steps") },
    ({ name }) => {
      const found = describeComponents().find((c) => c.name === name);
      if (!found) throw notFound(`没有名为 ${name} 的组件。可用的有：${describeComponents().map((c) => c.name).join("、")}。`);
      return found;
    },
  );

  tool("list_tags", "列出已发布文章用到的标签和各自的文章数，用得多的在前。给文章打标签前先看这里，能复用已有的就不要新起。", {}, () =>
    listTags(db),
  );

  tool("list_categories", "列出站点的分类。每篇文章都要归入其中一个；新分类只能由站长在后台创建。", {}, () =>
    listCategories(db).map((c) => ({ slug: c.slug, name: c.name, publishedCount: c.publishedCount })),
  );

  // ---- 变更集 ----
  tool(
    "open_change_set",
    "开启一个变更集。你的一切修改都要在某个变更集里进行，最后提交给站长审阅。",
    {
      kind: z.enum(CHANGE_SET_KINDS).describe("article 新文章（来自选题的新文章请改用 claim_topic）；document_edit 修改已有文章；page 页面调整；knowledge 整理知识块；block_update 更新知识块及受影响的文章"),
      title: z.string().describe("一句话说明这次要做什么，站长会在看板上看到"),
      summary: z
        .string()
        .optional()
        .describe("补充说明：为什么做、做了哪些取舍。批准后标题和这段说明会出现在公开的运营日志里，读者能看到，不要写私密的内容"),
    },
    (args) => {
      const cs = openChangeSet(db, actor, args);
      return { changeSetId: cs.id, status: cs.status };
    },
  );

  tool(
    "get_change_set",
    "查看一个变更集的状态、站长的意见和批注（comments），以及其中每个知识块和每篇文档的完整内容。每篇文档附带一份最新的检查结果（issues），提交前用它自查。",
    { changeSetId: z.string() },
    ({ changeSetId }) => {
    const { changeSet, blockItems, documentItems } = changeSetContents(db, changeSetId);
    if (changeSet.createdById !== actor.id) throw notFound(`变更集 ${changeSetId} 不存在。`);
    const categoryById = new Map(listCategories(db).map((c) => [c.id, c.slug]));
    return {
      changeSetId: changeSet.id,
      kind: changeSet.kind,
      title: changeSet.title,
      status: changeSet.status,
      ownerNote: changeSet.decisionNote,
      // 站长在具体文字上写的批注。status 为 open 的要逐条处理并用 reply_comment 回复，否则不能重新提交。
      comments: listComments(db, changeSetId).map((c) => {
        const source =
          c.targetType === "document"
            ? documentItems.find((d) => d.revision.id === c.targetRevisionId)?.revision.body
            : blockItems.find((b) => b.revision.id === c.targetRevisionId)?.revision.body;
        return {
          commentId: c.id,
          status: c.status,
          on: c.target?.type === "block" ? { blockId: c.target.blockId, title: c.target.title } : c.target ? { documentId: c.target.documentId, title: c.target.title } : null,
          // 站长选中的那段文字，是页面上显示的样子，不含标记。没有 quote 表示批注针对整篇内容。
          quote: c.anchor?.exact ?? null,
          // 帮你在源码里找到位置：它前后紧挨着的文字，以及估计的行号（能确定时才有）。
          textBefore: c.anchor?.prefix ?? null,
          textAfter: c.anchor?.suffix ?? null,
          line: c.anchor && source ? (lineOfQuote(source, c.anchor.exact) ?? null) : null,
          comment: c.body,
          yourReply: c.reply,
        };
      }),
      // 连同内容一起返回：被打回后修改，或者提交前自查，都不需要再逐个去读。
      blocks: blockItems.map(({ block, revision }) => ({
        blockId: block.id,
        type: block.type,
        title: revision.title,
        body: revision.body,
        data: revision.data,
        sources: revision.sources,
        isNew: revision.revNo === 1,
      })),
      documents: documentItems.map(({ document, revision }) => ({
        documentId: document.id,
        slug: document.slug,
        title: revision.title,
        summary: revision.summary,
        category: categoryById.get(revision.categoryId ?? "") ?? null,
        tags: revision.tags,
        series: revision.series,
        body: revision.body,
        isNew: revision.revNo === 1,
        // 按当前的知识库重新检查一遍正文。提交之后就不能改了，提交前先看这里有没有问题。
        issues: checkDocumentBody(db, changeSet.id, revision.body),
      })),
    };
  },
  );

  tool("submit_change_set", "把变更集提交给站长审阅。提交后不能再修改，除非被打回。", { changeSetId: z.string() }, ({ changeSetId }) => {
    const cs = submitChangeSet(db, actor, changeSetId);
    return { changeSetId: cs.id, status: cs.status };
  });

  tool(
    "publish_change_set",
    "让这个变更集里的内容直接上线，不经过审阅。只有站长在后台单独给你开了这个权限才能用；没开时会告诉你，照常用 submit_change_set 提交等审阅。开着的时候写完直接上线就行，不用再让站长去后台点一次。这样上线的内容在后台会标出「没经过审阅」，站长事后照样看得到、能下线，所以该有的谨慎一点都不能少：拿不准的说法宁可不写，也不要上线了再说。",
    { changeSetId: z.string(), note: z.string().optional().describe("一句话说明这次上线了什么，会记进运营日志") },
    ({ changeSetId, note }) => {
      const result = publishChangeSet(db, actor, changeSetId, note);
      hooks.onPublicChange?.();
      return { status: result.changeSet.status, slugs: result.affected.slugs, blockIds: result.affected.blockIds };
    },
  );

  tool("withdraw_change_set", "撤回一个不再需要的变更集，释放它占用的知识块和文档。", { changeSetId: z.string() }, ({ changeSetId }) => {
    const cs = withdrawChangeSet(db, actor, changeSetId);
    return { changeSetId: cs.id, status: cs.status };
  });

  // ---- 知识库 ----
  tool(
    "search_blocks",
    "搜索站里已经确认的知识块。写作前先搜索，已有的内容直接引用。多个词用空格分开，命中任何一个词就会返回，命中的词越多排得越前。",
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
      materialId: z.string().optional().describe("这个知识块是从哪条素材整理出来的。来自私密素材的知识块会自动设为私密"),
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
    { blockId: z.string(), reason: z.string().describe("为什么认为它过期：哪里可能不成立了，依据是什么。之后来修订的人要靠它知道该查什么") },
    ({ blockId, reason }) => {
      const result = markBlockStale(db, actor, blockId, reason);
      hooks.onPublicChange?.();
      return result;
    },
  );

  tool(
    "reply_comment",
    "回复站长的一条批注，说明你是怎么处理的；批注随之标为已处理。先按批注把内容改好，再回复。还有批注没回复时，变更集不能重新提交。",
    {
      commentId: z.string(),
      reply: z.string().describe("一两句话：改了什么。如果没有照做，说明原因"),
    },
    ({ commentId, reply }) => replyToComment(db, actor, commentId, reply),
  );

  // ---- 素材 ----
  tool(
    "add_material",
    "替站长往素材箱里记一条素材：他的想法、经历、踩过的坑。只记站长本人说过或做过的事，用第一人称，不要加入你自己的推断。",
    {
      content: z.string().describe("素材内容。把背景、过程和结论写清楚，脱离当前对话也能看懂"),
      url: z.string().optional().describe("相关的链接"),
      isPrivate: z.boolean().optional().describe("站长不想公开的内容设为 true"),
    },
    (args) => {
      const material = addMaterial(db, actor, args);
      return { materialId: material.id, status: material.status };
    },
  );

  tool(
    "list_materials",
    "列出素材箱里的素材，默认只列还没处理的。给出 materialId 时返回那一条的完整内容和它已经整理出的知识块、选题。",
    { materialId: z.string().optional(), includeProcessed: z.boolean().optional() },
    ({ materialId, includeProcessed }) =>
      materialId
        ? getMaterial(db, materialId)
        : listMaterials(db, { status: includeProcessed ? ["new", "processed"] : ["new"] }).map((m) => ({
            materialId: m.id,
            content: m.content,
            url: m.url,
            isPrivate: m.isPrivate,
            status: m.status,
            blockCount: m.blockCount,
            topicCount: m.topicCount,
          })),
  );

  tool(
    "mark_material_processed",
    "标记一条素材已经处理完。先把它整理成知识块（create_block 时带上 materialId）和候选选题，再调用这个。",
    {
      materialId: z.string(),
      note: z.string().describe("一句说明：整理成了什么，或者为什么没有可用的内容"),
    },
    ({ materialId, note }) => markMaterialProcessed(db, actor, materialId, note),
  );

  // ---- 选题 ----
  tool(
    "propose_topic",
    "提出一个候选选题。它不会直接进入可写的队列，要等站长采纳。",
    {
      title: z.string().describe("选题的标题，写成读者会想点开的样子"),
      note: z.string().describe("为什么值得写、打算从什么角度写、会用到哪些已有的知识块或素材"),
      materialId: z.string().optional().describe("如果这个选题来自某条素材"),
    },
    (args) => {
      const topic = createTopic(db, actor, args);
      return { topicId: topic.id, status: topic.status };
    },
  );

  tool(
    "list_topics",
    "列出选题。默认列出站长已采纳、可以开写的，优先级高的在前。",
    { includeProposed: z.boolean().optional().describe("同时列出还在等站长决定的候选") },
    ({ includeProposed }) =>
      listTopics(db, { status: includeProposed ? ["accepted", "proposed"] : ["accepted"] }).map((t) => ({
        topicId: t.id,
        title: t.title,
        note: t.note,
        status: t.status,
        priority: t.priority,
        materialId: t.originMaterialId,
      })),
  );

  tool(
    "claim_topic",
    "领取一个站长已采纳的选题，开始写。会为它开一个变更集并返回 changeSetId，之后的 create_block、save_document 都用这个 changeSetId。选题来自素材时，同时返回素材原文和它整理出的知识块的当前状态。",
    { topicId: z.string() },
    ({ topicId }) => {
      const { topic, changeSet } = claimTopic(db, actor, topicId);
      // 选题的说明是提出时写的，里面提到的知识块状态可能已经过时。这里给出素材产出的知识块现在的状态。
      const fromMaterial = topic.originMaterialId ? getMaterial(db, topic.originMaterialId) : undefined;
      return {
        changeSetId: changeSet.id,
        topicId: topic.id,
        title: topic.title,
        note: topic.note,
        material: fromMaterial && {
          materialId: fromMaterial.id,
          content: fromMaterial.content,
          url: fromMaterial.url,
          isPrivate: fromMaterial.isPrivate,
          blocks: fromMaterial.outputs.blocks,
        },
      };
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
      summary: z.string().optional().describe("一两句话的摘要，显示在文章列表里。修改文章时省略表示不变"),
      category: z.string().optional().describe("分类的网址别名，见 list_categories。新文章必须给出；修改文章时省略表示不变"),
      tags: z
        .array(z.string())
        .optional()
        .describe("标签，最多 5 个，先用 list_tags 看已有的，能复用就复用。修改文章时省略表示不变，传空数组表示去掉全部标签"),
      series: z
        .string()
        .optional()
        .describe("系列名。几篇文章连着讲一件事时用同一个系列名，页面上会按发布时间排成第 1、2、3 篇，并显示上下篇。已有的系列见 list_documents。修改文章时省略表示不变，传空字符串表示移出系列"),
      body: z.string().describe("正文，Markdown 加引用标记，语法见 writing 技能"),
    },
    async (args) => {
      // 正文里的演示代码先在沙箱里跑一遍、Mermaid 图先检查一遍，有错时保存会报出来
      await prepareBody(args.body);
      return saveDocument(db, actor, args);
    },
  );

  tool(
    "edit_document",
    "只改正文里的一小段：把 find 换成 replace，标题、摘要、分类和其余正文原样保留。改一两句话时用它，不要用 save_document 重交整篇，那样容易误改别的地方。find 要和正文源码逐字一致，并且只出现一次。",
    {
      changeSetId: z.string(),
      documentId: z.string(),
      find: z.string().describe("要替换的原文，和正文源码逐字一致（包括标记）。必须恰好出现一次"),
      replace: z.string().describe("替换成的文字"),
    },
    async (args) => {
      // 先按替换后的正文把演示代码跑一遍（替换本身和各种检查在 replaceInDocument 里）
      const current = getDocumentForEditing(db, { documentId: args.documentId }, args.changeSetId);
      if (current.body.includes(args.find)) await prepareBody(current.body.replace(args.find, () => args.replace));
      return replaceInDocument(db, actor, args);
    },
  );

  tool(
    "get_document",
    "读取一篇文档的正文。给出变更集时优先返回其中的草稿，否则返回线上的版本。",
    { documentId: z.string().optional(), slug: z.string().optional(), changeSetId: z.string().optional() },
    ({ documentId, slug, changeSetId }) => getDocumentForEditing(db, { documentId, slug }, changeSetId),
  );

  tool(
    "list_documents",
    "列出站里已有的文章：标题、网址别名、分类、所属系列和状态。提选题之前用它确认没有重复的题目。",
    {},
    () =>
      listDocuments(db)
        .filter((d) => d.kind === "article")
        .map((d) => ({ documentId: d.id, slug: d.slug, title: d.title, category: d.categoryName, series: d.series, status: d.status })),
  );

  tool(
    "upload_image",
    "往媒体库传一张图片，传完就能在正文里用 ![说明](返回的 url) 引用。只收你自己做出来的图：截图、自己画的图表、自己生成的插图。不要把从网上找到的图片传上来，版权不清楚；也不要传含有私人信息的截图。传上来的图片站长在审阅时会一起看到，不合适会被删掉。",
    {
      data: z.string().describe("图片内容，base64 编码。支持 PNG、JPEG、GIF、WebP、AVIF，单张不超过 10 MB。不支持 SVG"),
      alt: z.string().min(1).describe("图片说明，讲清楚图里有什么。看不见图的读者靠它理解，搜索引擎也读它，必须填"),
      filename: z.string().optional().describe("原始文件名，只用于站长在后台辨认"),
    },
    ({ data, alt, filename }) => {
      let bytes: Buffer;
      try {
        bytes = Buffer.from(data, "base64");
      } catch {
        throw invalid("图片内容不是合法的 base64。");
      }
      const saved = saveMedia(db, actor, { bytes: new Uint8Array(bytes), alt, originalName: filename });
      return { url: `/media/${saved.name}`, alt: saved.alt, markdown: `![${saved.alt}](/media/${saved.name})` };
    },
  );

  // ---- 访问数据 ----
  tool(
    "get_analytics",
    "读站点的访问数据：哪些文章有人读、哪些发出去没人看、读者从哪个站点过来、哪些分类和标签读得多。提选题之前先看这里，按读者真正在读的方向定题，不要凭空想。只有汇总数字，没有具体某个读者的信息。",
    {
      days: z.number().int().min(1).max(365).optional().describe("往前看多少天，默认 30"),
      limit: z.number().int().min(1).max(50).optional().describe("热门文章和标签各列几条，默认 10"),
    },
    ({ days, limit }) => readerStats(db, { days, limit }),
  );

  tool(
    "list_media",
    "列出媒体库里的图片。正文里只能用这里的图片，写法是 ![说明](url)；不能引用外部图片，也不能自己上传。需要新图片时在变更集的说明里告诉站长。",
    {},
    () => listMedia(db).map((m) => ({ url: m.url, alt: m.alt, markdown: `![${m.alt}](${m.url})` })),
  );

  return server;
}
