import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { GalleyError } from "../errors";
import { authenticateAgent, createAgent, regenerateAgentToken } from "../services/agents";
import {
  blockImpact,
  createBlock,
  getBlockView,
  markBlockStale,
  proposeBlockUpdate,
  setBlockVisibility,
} from "../services/blocks";
import { createCategory, deleteCategory, listCategories, updateCategory } from "../services/categories";
import { decideChangeSet, openChangeSet, submitChangeSet, withdrawChangeSet } from "../services/changeSets";
import {
  getPublishedDocument,
  listDocuments,
  listPublished,
  listStaleCitations,
  saveDocument,
  setDocumentPublished,
} from "../services/documents";
import { getNextTasks } from "../services/tasks";

let db: Db;
let agent: Actor;

const SOURCE = [{ url: "https://example.com/source", title: "来源" }];

function expectError(fn: () => unknown, code: GalleyError["code"], pattern?: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GalleyError);
    expect((e as GalleyError).code).toBe(code);
    if (pattern) expect((e as GalleyError).message).toMatch(pattern);
    return;
  }
  throw new Error("预期会抛出错误，但没有");
}

/** Agent 新建一个事实块并提交，站长批准。返回知识块编号。 */
function publishFact(title: string, body: string, extra: { values?: Record<string, string> } = {}) {
  const cs = openChangeSet(db, agent, { kind: "knowledge", title: `整理：${title}` });
  const result = createBlock(db, agent, {
    changeSetId: cs.id,
    type: "fact",
    title,
    body,
    data: extra.values ? { values: extra.values } : {},
    sources: SOURCE,
    confirmNew: true,
  });
  if (!result.created) throw new Error("没有创建成功");
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return result.blockId;
}

/** Agent 写一篇文章并提交，站长批准。返回文档编号。 */
function publishArticle(slug: string, body: string) {
  const cs = openChangeSet(db, agent, { kind: "article", title: `新文章：${slug}` });
  const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title: slug, body });
  if (!saved.saved) throw new Error(`保存失败：${JSON.stringify(saved.issues)}`);
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return saved.documentId;
}

beforeEach(() => {
  db = openDb(":memory:");
  const created = createAgent(db, OWNER, "测试 Agent");
  agent = authenticateAgent(db, created.token)!;
});

describe("发布把关", () => {
  it("Agent 不能批准变更集，站长可以", () => {
    const cs = openChangeSet(db, agent, { kind: "article", title: "第一篇" });
    saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "first", title: "第一篇", body: "正文。" });
    submitChangeSet(db, agent, cs.id);

    expectError(() => decideChangeSet(db, agent, cs.id, "approve"), "forbidden", /只有站长/);
    expect(getPublishedDocument(db, "first")).toBeUndefined();

    decideChangeSet(db, OWNER, cs.id, "approve");
    expect(getPublishedDocument(db, "first")?.title).toBe("第一篇");
  });

  it("没有提交审阅的变更集不能被批准", () => {
    const cs = openChangeSet(db, agent, { kind: "article", title: "草稿" });
    saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "draft", title: "草稿", body: "正文。" });
    expectError(() => decideChangeSet(db, OWNER, cs.id, "approve"), "conflict");
  });

  it("空的变更集不能提交", () => {
    const cs = openChangeSet(db, agent, { kind: "article", title: "空的" });
    expectError(() => submitChangeSet(db, agent, cs.id), "invalid");
  });

  it("Agent 不能操作别的 Agent 的变更集，也不能接入新的 Agent", () => {
    const other = authenticateAgent(db, createAgent(db, OWNER, "另一个").token)!;
    const cs = openChangeSet(db, agent, { kind: "article", title: "我的" });
    expectError(
      () => saveDocument(db, other, { changeSetId: cs.id, kind: "article", slug: "x", title: "x", body: "x" }),
      "forbidden",
    );
    expectError(() => createAgent(db, agent, "偷偷接入"), "forbidden");
  });

  it("停用的 Agent 无法通过认证", () => {
    const { token } = createAgent(db, OWNER, "临时");
    expect(authenticateAgent(db, token)).not.toBeNull();
    expect(authenticateAgent(db, "gly_wrong")).toBeNull();
    expect(authenticateAgent(db, "not-a-token")).toBeNull();
  });

  it("打回后 Agent 可以修改并重新提交", () => {
    const cs = openChangeSet(db, agent, { kind: "article", title: "待改" });
    const first = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "fix", title: "待改", body: "第一版。" });
    submitChangeSet(db, agent, cs.id);
    decideChangeSet(db, OWNER, cs.id, "reject", "开头太啰嗦");

    expect(getNextTasks(db, agent).rejected).toEqual([
      { changeSetId: cs.id, kind: "article", title: "待改", note: "开头太啰嗦" },
    ]);

    if (!first.saved) throw new Error("保存失败");
    const second = saveDocument(db, agent, { changeSetId: cs.id, documentId: first.documentId, title: "改好了", body: "第二版。" });
    // 同一个变更集里重复保存，覆盖之前的草稿，而不是新增版本。
    expect(second.saved && second.revisionId).toBe(first.revisionId);
    submitChangeSet(db, agent, cs.id);
    decideChangeSet(db, OWNER, cs.id, "approve");
    expect(getPublishedDocument(db, "fix")?.body).toBe("第二版。");
  });
});

describe("引用校验", () => {
  it("新文章和它新建的知识块在同一个变更集里一起生效", () => {
    const cs = openChangeSet(db, agent, { kind: "article", title: "带知识块的文章" });
    const block = createBlock(db, agent, {
      changeSetId: cs.id,
      type: "fact",
      title: "Codex 支持插件",
      body: "Codex 从 2026 年 3 月起支持插件。",
      sources: SOURCE,
    });
    if (!block.created) throw new Error("没有创建成功");
    expect(getBlockView(db, block.blockId)).toBeUndefined(); // 批准前对外不可见

    const saved = saveDocument(db, agent, {
      changeSetId: cs.id,
      kind: "article",
      slug: "codex-plugins",
      title: "Codex 插件",
      body: `:cite[Codex 现在支持插件]{b=${block.blockId}}。`,
    });
    expect(saved.saved).toBe(true);
    submitChangeSet(db, agent, cs.id);
    decideChangeSet(db, OWNER, cs.id, "approve");

    const view = getBlockView(db, block.blockId)!;
    expect(view.status).toBe("verified");
    const doc = getPublishedDocument(db, "codex-plugins")!;
    expect(doc.blocks[block.blockId].revisionId).toBe(view.revisionId);
    expect(listStaleCitations(db)).toEqual([]);
  });

  it("编号写错时不保存，并提示相近的编号", () => {
    const blockId = publishFact("某个事实", "这是一个事实。");
    const wrong = blockId.slice(0, 7) + (blockId[7] === "0" ? "1" : "0");
    const cs = openChangeSet(db, agent, { kind: "article", title: "写错编号" });
    const saved = saveDocument(db, agent, {
      changeSetId: cs.id,
      kind: "article",
      slug: "typo",
      title: "写错编号",
      body: `:cite[一句话]{b=${wrong}}`,
    });
    expect(saved.saved).toBe(false);
    expect(saved.issues[0].message).toContain("不存在");
    expect(saved.issues[0].message).toContain(blockId);
  });

  it("取值不存在、组件引用的知识块类型不对时报错", () => {
    const blockId = publishFact("最新版本", "当前最新版本是 16.4。", { values: { version: "16.4" } });
    const cs = openChangeSet(db, agent, { kind: "article", title: "取值" });
    const save = (body: string) =>
      saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "values", title: "取值", body });

    const bad = save(`版本是 :value{b=${blockId} key=price}。`);
    expect(bad.saved).toBe(false);
    expect(bad.issues[0].message).toMatch(/没有名为 price 的取值.*version/);

    const wrongType = save(`::chart{data=${blockId}}`);
    expect(wrongType.saved).toBe(false);
    expect(wrongType.issues[0].message).toMatch(/fact 类型.*需要 data/);

    expect(save(`版本是 :value{b=${blockId} key=version}。`).saved).toBe(true);
  });

  it("事实类知识块必须有来源", () => {
    const cs = openChangeSet(db, agent, { kind: "knowledge", title: "没有来源" });
    expectError(
      () => createBlock(db, agent, { changeSetId: cs.id, type: "fact", title: "没来源", body: "一个说法。" }),
      "invalid",
      /至少需要一个来源/,
    );
    // 观点的来源是站长本人，不需要外部来源。
    const opinion = createBlock(db, agent, { changeSetId: cs.id, type: "opinion", title: "一个看法", body: "我认为如此。" });
    expect(opinion.created).toBe(true);
  });

  it("新建时发现相似的知识块，需要确认才能继续创建", () => {
    publishFact("Codex 支持插件", "Codex 从 2026 年 3 月起支持插件。");
    const cs = openChangeSet(db, agent, { kind: "knowledge", title: "重复" });
    const input = {
      changeSetId: cs.id,
      type: "fact" as const,
      title: "Codex 支持插件功能",
      body: "Codex 从 2026 年 3 月开始支持插件。",
      sources: SOURCE,
    };
    const first = createBlock(db, agent, input);
    expect(first.created).toBe(false);
    expect(!first.created && first.similar).toHaveLength(1);
    expect(createBlock(db, agent, { ...input, confirmNew: true }).created).toBe(true);
  });
});

describe("私密内容", () => {
  it("私密知识块不能被公开文档引用", () => {
    const blockId = publishFact("内部信息", "这是不想公开的内容。");
    setBlockVisibility(db, OWNER, blockId, "private");
    expectError(() => setBlockVisibility(db, agent, blockId, "public"), "forbidden");

    const cs = openChangeSet(db, agent, { kind: "article", title: "泄露" });
    const saved = saveDocument(db, agent, {
      changeSetId: cs.id,
      kind: "article",
      slug: "leak",
      title: "泄露",
      body: `:cite[内部消息]{b=${blockId}}`,
    });
    expect(saved.saved).toBe(false);
    expect(saved.issues[0].message).toContain("私密知识块");
  });

  it("保存之后知识块才被改为私密，批准时仍然会被拦下", () => {
    const blockId = publishFact("后来变私密", "先公开后私密的内容。");
    const cs = openChangeSet(db, agent, { kind: "article", title: "时间差" });
    saveDocument(db, agent, {
      changeSetId: cs.id,
      kind: "article",
      slug: "race",
      title: "时间差",
      body: `:cite[一句话]{b=${blockId}}`,
    });
    submitChangeSet(db, agent, cs.id);
    setBlockVisibility(db, OWNER, blockId, "private");

    expectError(() => decideChangeSet(db, OWNER, cs.id, "approve"), "invalid", /私密知识块/);
    expect(getPublishedDocument(db, "race")).toBeUndefined();
  });
});

describe("变更传播", () => {
  const setup = () => {
    const blockId = publishFact("插件支持时间", "Codex 从 2026 年 3 月起支持插件。", { values: { month: "3 月" } });
    const body = `:cite[Codex 今年春天开始支持插件]{b=${blockId}}，具体是 :value{b=${blockId} key=month}。`;
    const documentId = publishArticle("plugins", body);
    return { blockId, documentId, body };
  };

  it("提议更新时返回受影响的位置", () => {
    const { blockId } = setup();
    const cs = openChangeSet(db, agent, { kind: "block_update", title: "更新时间" });
    const result = proposeBlockUpdate(db, agent, {
      changeSetId: cs.id,
      blockId,
      body: "Codex 从 2026 年 4 月起支持插件。",
      reason: "官方更正了日期",
    });
    expect(result.impact.citations).toEqual([
      expect.objectContaining({ slug: "plugins", spanText: "Codex 今年春天开始支持插件" }),
    ]);
    expect(result.impact.embeds).toEqual([expect.objectContaining({ slug: "plugins", mode: "value" })]);
  });

  it("知识块更新生效后，没有同步修订的依据引用变成过期；修订后恢复", () => {
    const { blockId, documentId, body } = setup();
    const before = getBlockView(db, blockId)!;

    const update = openChangeSet(db, agent, { kind: "block_update", title: "更新时间" });
    proposeBlockUpdate(db, agent, {
      changeSetId: update.id,
      blockId,
      body: "Codex 从 2026 年 4 月起支持插件。",
      data: { values: { month: "4 月" } },
      reason: "官方更正了日期",
    });
    submitChangeSet(db, agent, update.id);
    decideChangeSet(db, OWNER, update.id, "approve");

    const stale = listStaleCitations(db);
    expect(stale).toEqual([expect.objectContaining({ slug: "plugins", blockId, reason: "block_updated" })]);
    expect(getNextTasks(db, agent).staleCitations).toHaveLength(1);

    // 已发布的文章：依据仍显示它锁定的旧版本，取值嵌入已经跟随新版本。
    const live = getBlockView(db, blockId)!;
    expect(live.revisionId).not.toBe(before.revisionId);
    expect(live.values.month).toBe("4 月");
    expect(getPublishedDocument(db, "plugins")!.blocks[blockId].revisionId).toBe(before.revisionId);

    // Agent 修订文章：重新保存后，依据锁定到新版本。
    const revise = openChangeSet(db, agent, { kind: "document_edit", title: "修订 plugins" });
    saveDocument(db, agent, {
      changeSetId: revise.id,
      documentId,
      title: "plugins",
      body: body.replace("今年春天", "今年四月"),
    });
    submitChangeSet(db, agent, revise.id);
    decideChangeSet(db, OWNER, revise.id, "approve");

    expect(listStaleCitations(db)).toEqual([]);
    expect(getPublishedDocument(db, "plugins")!.blocks[blockId].revisionId).toBe(live.revisionId);
  });

  it("知识块和受影响的文章可以在同一个变更集里一起生效", () => {
    const { blockId, documentId, body } = setup();
    const cs = openChangeSet(db, agent, { kind: "block_update", title: "更新并修订" });
    proposeBlockUpdate(db, agent, { changeSetId: cs.id, blockId, body: "Codex 从 2026 年 4 月起支持插件。", reason: "更正" });
    saveDocument(db, agent, { changeSetId: cs.id, documentId, title: "plugins", body: body.replace("今年春天", "今年四月") });
    submitChangeSet(db, agent, cs.id);

    // 批准之前，线上内容不变。
    expect(getPublishedDocument(db, "plugins")!.body).toContain("今年春天");
    decideChangeSet(db, OWNER, cs.id, "approve");

    expect(getPublishedDocument(db, "plugins")!.body).toContain("今年四月");
    expect(listStaleCitations(db)).toEqual([]);
  });

  it("不改变含义的修改不会让引用过期", () => {
    const { blockId } = setup();
    const cs = openChangeSet(db, agent, { kind: "block_update", title: "补充来源" });
    proposeBlockUpdate(db, agent, {
      changeSetId: cs.id,
      blockId,
      sources: [...SOURCE, { url: "https://example.com/second" }],
      semanticChange: false,
      reason: "补充一个来源",
    });
    submitChangeSet(db, agent, cs.id);
    decideChangeSet(db, OWNER, cs.id, "approve");

    expect(getBlockView(db, blockId)!.sources).toHaveLength(2);
    expect(listStaleCitations(db)).toEqual([]);
  });

  it("标记为已过期后，引用它的文章出现在待办里", () => {
    const { blockId } = setup();
    const result = markBlockStale(db, agent, blockId);
    expect(result.impact.citations).toHaveLength(1);
    expect(listStaleCitations(db)).toEqual([
      expect.objectContaining({ blockId, reason: "block_marked_stale", blockStatus: "stale" }),
    ]);
    expect(getPublishedDocument(db, "plugins")!.staleBlockIds).toEqual([blockId]);
  });

  it("同一个知识块同时只能在一个未结束的变更集里，撤回后释放", () => {
    const { blockId } = setup();
    const first = openChangeSet(db, agent, { kind: "block_update", title: "第一个" });
    proposeBlockUpdate(db, agent, { changeSetId: first.id, blockId, body: "改法一。", reason: "一" });

    const second = openChangeSet(db, agent, { kind: "block_update", title: "第二个" });
    const attempt = () => proposeBlockUpdate(db, agent, { changeSetId: second.id, blockId, body: "改法二。", reason: "二" });
    expectError(attempt, "conflict", /第一个/);

    withdrawChangeSet(db, agent, first.id);
    expect(attempt().revisionId).toBeTruthy();
  });

  it("知识块的被引用情况只统计已发布文档的当前版本", () => {
    const { blockId } = setup();
    expect(blockImpact(db, blockId).citations).toHaveLength(1);
    const cs = openChangeSet(db, agent, { kind: "article", title: "未发布" });
    saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "unpublished", title: "未发布", body: `:cite[另一句]{b=${blockId}}` });
    expect(blockImpact(db, blockId).citations).toHaveLength(1);
  });
});

describe("分类", () => {
  it("只有站长能创建分类", () => {
    expectError(() => createCategory(db, agent, { slug: "ai", name: "AI" }), "forbidden");
    createCategory(db, OWNER, { slug: "ai", name: "AI" });
    expectError(() => createCategory(db, OWNER, { slug: "ai", name: "重复" }), "conflict");
    expectError(() => createCategory(db, OWNER, { slug: "AI 编程", name: "别名不合法" }), "invalid");
  });

  it("站点有分类之后，新文章必须指定一个已有的分类", () => {
    createCategory(db, OWNER, { slug: "ai", name: "AI" });
    const cs = openChangeSet(db, agent, { kind: "article", title: "分类" });
    const base = { changeSetId: cs.id, kind: "article" as const, slug: "categorized", title: "有分类的文章", body: "正文。" };

    expectError(() => saveDocument(db, agent, base), "invalid", /需要指定分类.*ai（AI）/);
    expectError(() => saveDocument(db, agent, { ...base, category: "made-up" }), "invalid", /不存在.*ai（AI）/);

    expect(saveDocument(db, agent, { ...base, category: "ai" }).saved).toBe(true);
    submitChangeSet(db, agent, cs.id);
    decideChangeSet(db, OWNER, cs.id, "approve");

    expect(getPublishedDocument(db, "categorized")!.category).toEqual({ slug: "ai", name: "AI" });
    expect(listCategories(db)[0].publishedCount).toBe(1);
    expect(listPublished(db, "article", { categorySlug: "ai" })).toHaveLength(1);
  });

  it("修改文章时不给分类，沿用原来的；改分类要等批准后才生效", () => {
    createCategory(db, OWNER, { slug: "ai", name: "AI" });
    createCategory(db, OWNER, { slug: "essays", name: "随笔" });
    const first = openChangeSet(db, agent, { kind: "article", title: "第一版" });
    const saved = saveDocument(db, agent, { changeSetId: first.id, kind: "article", slug: "moving", title: "搬家", category: "ai", body: "第一版。" });
    if (!saved.saved) throw new Error("保存失败");
    submitChangeSet(db, agent, first.id);
    decideChangeSet(db, OWNER, first.id, "approve");

    const edit = openChangeSet(db, agent, { kind: "document_edit", title: "只改正文" });
    saveDocument(db, agent, { changeSetId: edit.id, documentId: saved.documentId, title: "搬家", body: "第二版。" });
    submitChangeSet(db, agent, edit.id);
    decideChangeSet(db, OWNER, edit.id, "approve");
    expect(getPublishedDocument(db, "moving")!.category?.slug).toBe("ai");

    const move = openChangeSet(db, agent, { kind: "document_edit", title: "改分类" });
    saveDocument(db, agent, { changeSetId: move.id, documentId: saved.documentId, title: "搬家", category: "essays", body: "第二版。" });
    submitChangeSet(db, agent, move.id);
    expect(getPublishedDocument(db, "moving")!.category?.slug).toBe("ai");
    decideChangeSet(db, OWNER, move.id, "approve");
    expect(getPublishedDocument(db, "moving")!.category?.slug).toBe("essays");
  });
});

describe("后台的管理操作", () => {
  it("站长可以下线和重新上线文章，Agent 不行", () => {
    const documentId = publishArticle("toggle", "正文。");
    expectError(() => setDocumentPublished(db, agent, documentId, false), "forbidden");

    setDocumentPublished(db, OWNER, documentId, false);
    expect(getPublishedDocument(db, "toggle")).toBeUndefined();
    expect(listDocuments(db).find((d) => d.id === documentId)?.status).toBe("unpublished");

    setDocumentPublished(db, OWNER, documentId, true);
    expect(getPublishedDocument(db, "toggle")?.title).toBe("toggle");
  });

  it("没有批准过的文章不能直接上线", () => {
    const cs = openChangeSet(db, agent, { kind: "article", title: "草稿" });
    const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "never-approved", title: "草稿", body: "正文。" });
    if (!saved.saved) throw new Error("保存失败");
    expectError(() => setDocumentPublished(db, OWNER, saved.documentId, true), "conflict", /还没有批准过/);
  });

  it("分类可以改名；有文章在用的分类不能删除", () => {
    const used = createCategory(db, OWNER, { slug: "ai", name: "AI" });
    const empty = createCategory(db, OWNER, { slug: "empty", name: "空的" });
    const cs = openChangeSet(db, agent, { kind: "article", title: "占用分类" });
    saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "uses-ai", title: "占用分类", category: "ai", body: "正文。" });

    updateCategory(db, OWNER, used.id, { slug: "ai-coding", name: "AI 编程" });
    expect(listCategories(db).map((c) => c.slug)).toContain("ai-coding");
    expectError(() => updateCategory(db, OWNER, empty.id, { slug: "ai-coding", name: "撞名" }), "conflict");
    expectError(() => updateCategory(db, agent, used.id, { slug: "x", name: "x" }), "forbidden");

    expectError(() => deleteCategory(db, OWNER, used.id), "conflict", /还有文章/);
    deleteCategory(db, OWNER, empty.id);
    expect(listCategories(db)).toHaveLength(1);
  });

  it("重新生成密钥后，旧密钥立即失效", () => {
    const { agent: created, token } = createAgent(db, OWNER, "换密钥");
    const next = regenerateAgentToken(db, OWNER, created.id);
    expect(authenticateAgent(db, token)).toBeNull();
    expect(authenticateAgent(db, next.token)?.id).toBe(created.id);
    expectError(() => regenerateAgentToken(db, agent, created.id), "forbidden");
  });
});
