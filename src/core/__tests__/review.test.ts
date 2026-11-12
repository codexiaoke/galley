import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { blockRevisions, changeSets, documentRevisions } from "../db/schema";
import { diffText } from "../diff";
import { GalleyError } from "../errors";
import { authenticateAgent, createAgent } from "../services/agents";
import { createBlock, editBlockAsOwner, editDraftBlock, getBlockView } from "../services/blocks";
import { decideChangeSet, listChangeSets, openChangeSet, submitChangeSet } from "../services/changeSets";
import { addComment, deleteComment, lineOfQuote, listComments, reopenComment, replyToComment } from "../services/comments";
import {
  editDocumentAsOwner,
  getDocumentForEditing,
  getPublishedDocument,
  listStaleCitations,
  previewDocumentBody,
  replaceInDocument,
  saveDocument,
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

function publishFact(title: string, body: string) {
  const cs = openChangeSet(db, agent, { kind: "knowledge", title: `整理：${title}` });
  const result = createBlock(db, agent, { changeSetId: cs.id, type: "fact", title, body, sources: SOURCE, confirmNew: true });
  if (!result.created) throw new Error("没有创建成功");
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return result.blockId;
}

function publishArticle(slug: string, body: string) {
  const cs = openChangeSet(db, agent, { kind: "article", title: `新文章：${slug}` });
  const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title: slug, body });
  if (!saved.saved) throw new Error(`保存失败：${JSON.stringify(saved.issues)}`);
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return saved.documentId;
}

/** Agent 写一篇文章并提交，停在待审。 */
function submitArticle(slug: string, body: string) {
  const cs = openChangeSet(db, agent, { kind: "article", title: `新文章：${slug}` });
  const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title: slug, body });
  if (!saved.saved) throw new Error("保存失败");
  submitChangeSet(db, agent, cs.id);
  return { changeSetId: cs.id, documentId: saved.documentId, revisionId: saved.revisionId };
}

beforeEach(() => {
  db = openDb(":memory:");
  agent = authenticateAgent(db, createAgent(db, OWNER, "测试 Agent").token)!;
});

describe("站长直接修改文章", () => {
  it("立即生效，留下新版本和一条已批准的记录", () => {
    const documentId = publishArticle("direct", "原来的正文。");
    const result = editDocumentAsOwner(db, OWNER, { documentId, title: "改过的标题", body: "站长改过的正文。" });
    expect(result.saved).toBe(true);
    expect(result.slugs).toEqual(["direct"]);

    const published = getPublishedDocument(db, "direct")!;
    expect(published.title).toBe("改过的标题");
    expect(published.body).toBe("站长改过的正文。");
    expect(published.revNo).toBe(2);

    const record = listChangeSets(db, { status: ["approved"] }).find((cs) => cs.createdByKind === "owner");
    expect(record?.kind).toBe("document_edit");
  });

  it("正文有错误时什么都不保存，也不留下半截的记录", () => {
    const documentId = publishArticle("broken", "原来的正文。");
    const before = db.select().from(changeSets).all().length;
    const result = editDocumentAsOwner(db, OWNER, { documentId, title: "标题", body: "引用了 :cite[不存在的]{b=nope0000} 知识块。" });
    expect(result.saved).toBe(false);
    expect(result.issues.some((i) => i.level === "error")).toBe(true);
    expect(getPublishedDocument(db, "broken")!.body).toBe("原来的正文。");
    expect(db.select().from(changeSets).all()).toHaveLength(before);
    expect(db.select().from(documentRevisions).all()).toHaveLength(1);
  });

  it("Agent 不能直接修改；还没上线过的文章要到它所在的改动里改", () => {
    const documentId = publishArticle("guarded", "正文。");
    expectError(() => editDocumentAsOwner(db, agent, { documentId, title: "x", body: "x" }), "forbidden");
    const pending = submitArticle("pending", "正文。");
    expectError(() => editDocumentAsOwner(db, OWNER, { documentId: pending.documentId, title: "x", body: "x" }), "conflict", /还没有上线过/);
  });

  it("文章正在某个未结束的改动里时，不能绕过它直接改", () => {
    const documentId = publishArticle("locked", "正文。");
    const cs = openChangeSet(db, agent, { kind: "document_edit", title: "Agent 在改" });
    saveDocument(db, agent, { changeSetId: cs.id, documentId, title: "locked", body: "Agent 的修改。" });
    expectError(() => editDocumentAsOwner(db, OWNER, { documentId, title: "locked", body: "站长的修改。" }), "conflict", /正在另一个/);
  });

  it("预览能给出问题清单和引用到的知识块", () => {
    const blockId = publishFact("行宽", "每行 30 到 40 个汉字最易读。");
    const ok = previewDocumentBody(db, `正文，:cite[每行不要太长]{b=${blockId}}。`);
    expect(ok.issues).toHaveLength(0);
    expect(Object.keys(ok.blocks)).toEqual([blockId]);
    expect(previewDocumentBody(db, "坏的 :cite[引用]{b=nope0000}。").issues[0].level).toBe("error");
  });
});

describe("站长直接修改知识块", () => {
  it("改变含义的修改会让引用它的文章进入待修订", () => {
    const blockId = publishFact("行宽", "每行 30 到 40 个汉字最易读。");
    publishArticle("width", `:cite[每行不要太长]{b=${blockId}}。`);
    editBlockAsOwner(db, OWNER, { blockId, body: "每行 25 到 35 个汉字最易读。" });

    expect(getBlockView(db, blockId)!.body).toBe("每行 25 到 35 个汉字最易读。");
    expect(listStaleCitations(db).map((c) => c.slug)).toEqual(["width"]);
    expect(getNextTasks(db, agent).staleCitations).toHaveLength(1);
  });

  it("不改变含义的修改不产生修订任务", () => {
    const blockId = publishFact("行宽", "每行 30 到 40 个汉字最易读。");
    publishArticle("width", `:cite[每行不要太长]{b=${blockId}}。`);
    editBlockAsOwner(db, OWNER, { blockId, body: "每行 30 到 40 个汉字，最易读。", semanticChange: false });

    expect(getBlockView(db, blockId)!.revNo).toBe(2);
    expect(listStaleCitations(db)).toHaveLength(0);
  });

  it("Agent 不能直接修改", () => {
    const blockId = publishFact("行宽", "每行 30 到 40 个汉字最易读。");
    expectError(() => editBlockAsOwner(db, agent, { blockId, body: "改掉。" }), "forbidden");
  });
});

describe("站长在待审的改动里直接改", () => {
  it("改完再批准，上线的是站长改过的内容", () => {
    const { changeSetId, documentId } = submitArticle("fixup", "有一个错别子。");
    // Agent 提交之后自己不能再改，站长可以。
    expectError(() => saveDocument(db, agent, { changeSetId, documentId, title: "fixup", body: "偷偷改。" }), "conflict");
    const saved = saveDocument(db, OWNER, { changeSetId, documentId, title: "fixup", body: "有一个错别字。" });
    expect(saved.saved).toBe(true);
    decideChangeSet(db, OWNER, changeSetId, "approve");
    expect(getPublishedDocument(db, "fixup")!.body).toBe("有一个错别字。");
  });

  it("待审的知识块草稿也可以改，Agent 的声明保持不变", () => {
    const cs = openChangeSet(db, agent, { kind: "knowledge", title: "整理" });
    const created = createBlock(db, agent, { changeSetId: cs.id, type: "opinion", title: "观点", body: "我认为要耐看。" });
    if (!created.created) throw new Error("没有创建成功");
    submitChangeSet(db, agent, cs.id);

    expectError(() => editDraftBlock(db, agent, { changeSetId: cs.id, blockId: created.blockId, title: "观点", body: "x" }), "forbidden");
    editDraftBlock(db, OWNER, { changeSetId: cs.id, blockId: created.blockId, title: "观点", body: "我认为后台要耐看。" });
    decideChangeSet(db, OWNER, cs.id, "approve");
    expect(getBlockView(db, created.blockId)!.body).toBe("我认为后台要耐看。");
  });
});

describe("审阅批注", () => {
  it("只有站长能写；批注要针对这个改动里的内容", () => {
    const a = submitArticle("a", "第一篇的正文。");
    const b = submitArticle("b", "第二篇的正文。");
    const input = { changeSetId: a.changeSetId, targetType: "document" as const, targetRevisionId: a.revisionId, quote: "第一篇", body: "这里展开讲。" };
    expectError(() => addComment(db, agent, input), "forbidden");
    expectError(() => addComment(db, OWNER, { ...input, body: "  " }), "invalid");
    expectError(() => addComment(db, OWNER, { ...input, targetRevisionId: b.revisionId }), "not_found");

    const comment = addComment(db, OWNER, { ...input, prefix: "", suffix: "的正文。" });
    expect(comment.anchor).toEqual({ exact: "第一篇", prefix: "", suffix: "的正文。" });
    expect(listComments(db, a.changeSetId)[0].target).toEqual({ type: "document", documentId: a.documentId, title: "a" });
  });

  it("打回之后，批注没有逐条回复就不能重新提交", () => {
    const { changeSetId, documentId, revisionId } = submitArticle("commented", "开头。中间这句说得太满。结尾。");
    const comment = addComment(db, OWNER, { changeSetId, targetType: "document", targetRevisionId: revisionId, quote: "中间这句说得太满", body: "收一点。" });
    decideChangeSet(db, OWNER, changeSetId, "reject", "见批注");

    saveDocument(db, agent, { changeSetId, documentId, title: "commented", body: "开头。中间这句留了余地。结尾。" });
    expectError(() => submitChangeSet(db, agent, changeSetId), "invalid", /还有 1 条批注没有回复/);

    expectError(() => replyToComment(db, agent, comment.id, " "), "invalid");
    expect(replyToComment(db, agent, comment.id, "已改成留有余地的说法。").openComments).toBe(0);
    submitChangeSet(db, agent, changeSetId);

    const [after] = listComments(db, changeSetId);
    expect(after.status).toBe("resolved");
    expect(after.reply).toBe("已改成留有余地的说法。");
  });

  it("别的 Agent 不能回复；站长可以重新打开或删除", () => {
    const { changeSetId, revisionId } = submitArticle("other", "正文。");
    const comment = addComment(db, OWNER, { changeSetId, targetType: "document", targetRevisionId: revisionId, body: "整体太短。" });
    const other = authenticateAgent(db, createAgent(db, OWNER, "另一个 Agent").token)!;
    expectError(() => replyToComment(db, other, comment.id, "我来回。"), "forbidden");

    replyToComment(db, agent, comment.id, "已加长。");
    expectError(() => reopenComment(db, agent, comment.id), "forbidden");
    reopenComment(db, OWNER, comment.id);
    expect(listComments(db, changeSetId)[0].status).toBe("open");
    // 重新打开后，之前的回复还在，方便对照。
    expect(listComments(db, changeSetId)[0].reply).toBe("已加长。");

    deleteComment(db, OWNER, comment.id);
    expect(listComments(db, changeSetId)).toHaveLength(0);
  });

  it("打回时记下当时的正文，重新提交后可以对比", () => {
    const { changeSetId, documentId, revisionId } = submitArticle("snapshot", "第一版。");
    decideChangeSet(db, OWNER, changeSetId, "reject", "重写");
    saveDocument(db, agent, { changeSetId, documentId, title: "snapshot", body: "第二版。" });
    const revision = db.select().from(documentRevisions).all().find((r) => r.id === revisionId)!;
    expect(revision.rejectedBody).toBe("第一版。");
    expect(revision.body).toBe("第二版。");
    expect(db.select().from(blockRevisions).all()).toHaveLength(0);
  });
});

describe("文字对比", () => {
  it("没有改动", () => {
    const diff = diffText("一段。\n\n另一段。", "一段。\n\n另一段。");
    expect(diff.changed).toBe(false);
    expect(diff.added + diff.removed).toBe(0);
  });

  it("段落内部的修改细到字词", () => {
    const diff = diffText("后台要好看，颜色要多。", "后台要耐看，颜色要少。");
    expect(diff.lines).toHaveLength(1);
    const [line] = diff.lines;
    if (line.kind !== "change") throw new Error("应该是段内修改");
    expect(line.segments.filter((s) => s.kind === "del").map((s) => s.text)).toEqual(["好", "多"]);
    expect(line.segments.filter((s) => s.kind === "add").map((s) => s.text)).toEqual(["耐", "少"]);
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(2);
  });

  it("新增和删除整段", () => {
    const diff = diffText("第一段。\n\n要删的一段。\n\n最后一段。", "第一段。\n\n最后一段。\n\n新加的一段。");
    expect(diff.lines.filter((l) => l.kind === "del").map((l) => l.kind === "del" && l.text)).toContain("要删的一段。");
    expect(diff.lines.filter((l) => l.kind === "add").map((l) => l.kind === "add" && l.text)).toContain("新加的一段。");
  });

  it("完全不同的两段不做段内对比，显示成一删一增", () => {
    const diff = diffText("今天讲排版。", "Next.js 16 changed caching.");
    expect(diff.lines.map((l) => l.kind)).toEqual(["del", "add"]);
  });

  it("英文按词对比，不拆成字母", () => {
    const diff = diffText("use await cookies() first", "use await connection() first");
    const [line] = diff.lines;
    if (line.kind !== "change") throw new Error("应该是段内修改");
    expect(line.segments.find((s) => s.kind === "del")?.text).toBe("cookies");
    expect(line.segments.find((s) => s.kind === "add")?.text).toBe("connection");
  });
});

describe("只改一小段", () => {
  it("替换恰好出现一次的文字，标题、摘要和其余正文不变", () => {
    const cs = openChangeSet(db, agent, { kind: "article", title: "新文章" });
    const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "small", title: "标题", summary: "原来的摘要", body: "第一句。第二句有错别子。第三句。" });
    if (!saved.saved) throw new Error("保存失败");
    const input = { changeSetId: cs.id, documentId: saved.documentId };

    expect(replaceInDocument(db, agent, { ...input, find: "错别子", replace: "错别字" }).saved).toBe(true);
    const after = getDocumentForEditing(db, { documentId: saved.documentId }, cs.id);
    expect(after.body).toBe("第一句。第二句有错别字。第三句。");
    expect(after.summary).toBe("原来的摘要");
    expect(after.title).toBe("标题");

    expectError(() => replaceInDocument(db, agent, { ...input, find: "不存在的话", replace: "x" }), "invalid", /没有找到/);
    expectError(() => replaceInDocument(db, agent, { ...input, find: "句。", replace: "x" }), "invalid", /出现了 2 次/);
  });

  it("保存时省略摘要表示不变，传空字符串才是清空", () => {
    const cs = openChangeSet(db, agent, { kind: "article", title: "新文章" });
    const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "keep", title: "标题", summary: "摘要", body: "正文。" });
    if (!saved.saved) throw new Error("保存失败");
    const read = () => getDocumentForEditing(db, { documentId: saved.documentId }, cs.id).summary;

    saveDocument(db, agent, { changeSetId: cs.id, documentId: saved.documentId, title: "标题", body: "改过的正文。" });
    expect(read()).toBe("摘要");
    saveDocument(db, agent, { changeSetId: cs.id, documentId: saved.documentId, title: "标题", summary: "", body: "改过的正文。" });
    expect(read()).toBe("");
  });

  it("修改已上线的文章时，省略摘要沿用线上的摘要", () => {
    const first = openChangeSet(db, agent, { kind: "article", title: "新文章" });
    const saved = saveDocument(db, agent, { changeSetId: first.id, kind: "article", slug: "online", title: "标题", summary: "线上的摘要", body: "正文。" });
    if (!saved.saved) throw new Error("保存失败");
    submitChangeSet(db, agent, first.id);
    decideChangeSet(db, OWNER, first.id, "approve");

    const edit = openChangeSet(db, agent, { kind: "document_edit", title: "修改" });
    saveDocument(db, agent, { changeSetId: edit.id, documentId: saved.documentId, title: "标题", body: "新的正文。" });
    expect(getDocumentForEditing(db, { documentId: saved.documentId }, edit.id).summary).toBe("线上的摘要");
  });
});

describe("批注在源码里的位置", () => {
  const source = "开头一段。\n\n第二段里有 :cite[一句带依据的话]{b=abcd1234}，后面还有内容。\n\n第三段。";

  it("能跨过标记找到所在的行", () => {
    expect(lineOfQuote(source, "第二段里有 一句带依据的话")).toBe(3);
    expect(lineOfQuote(source, "第三段")).toBe(5);
  });

  it("找不到或者有多处时不给行号，不误导", () => {
    expect(lineOfQuote(source, "完全没有的文字")).toBeUndefined();
    expect(lineOfQuote("重复的话。\n\n重复的话。", "重复的话")).toBeUndefined();
  });
});
