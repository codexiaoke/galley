import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { GalleyError } from "../errors";
import { authenticateAgent, createAgent } from "../services/agents";
import { createBlock, readBlockAsAgent, setBlockVisibility } from "../services/blocks";
import { decideChangeSet, openChangeSet, submitChangeSet } from "../services/changeSets";
import { editDocumentAsOwner, getDocumentForEditing, getPublishedDocument, listPublished, saveDocument } from "../services/documents";
import { listOperationLog, setHiddenFromLog } from "../services/oplog";
import { getSiteSettings, updateSiteSettings } from "../services/settings";
import { listTags, renameTag } from "../services/tags";
import { normalizeTags } from "../tags";

let db: Db;
let agent: Extract<Actor, { kind: "agent" }>;

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

function publish(slug: string, tags: string[], summary = "为什么写这篇", rejectFirst = false) {
  const cs = openChangeSet(db, agent, { kind: "article", title: `新文章：${slug}`, summary });
  const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title: slug, body: "正文。", tags });
  if (!saved.saved) throw new Error("保存失败");
  submitChangeSet(db, agent, cs.id);
  if (rejectFirst) {
    decideChangeSet(db, OWNER, cs.id, "reject", "再改改");
    submitChangeSet(db, agent, cs.id);
  }
  decideChangeSet(db, OWNER, cs.id, "approve");
  return { changeSetId: cs.id, documentId: saved.documentId };
}

beforeEach(() => {
  db = openDb(":memory:");
  agent = authenticateAgent(db, createAgent(db, OWNER, "Codex").token)!;
});

describe("标签", () => {
  it("整理写法：去掉多余空白、不分大小写去重；拒绝不合规的", () => {
    expect(normalizeTags([" AI  编程 ", "React", "react", "C#", "Node.js", ""])).toEqual(["AI 编程", "React", "C#", "Node.js"]);
    expect(() => normalizeTags(["a/b"])).toThrow(/不合规/);
    expect(() => normalizeTags(["#开头"])).toThrow(/不合规/);
    expect(() => normalizeTags(["一", "二", "三", "四", "五", "六"])).toThrow(/最多 5 个/);
  });

  it("标签记在版本上：省略时沿用，传空数组去掉；可以按标签列出文章", () => {
    const { documentId } = publish("tagged", ["SQLite", "部署"]);
    publish("other", ["部署"]);
    expect(getPublishedDocument(db, "tagged")!.tags).toEqual(["SQLite", "部署"]);
    expect(listPublished(db, "article", { tag: "部署" }).map((p) => p.slug).sort()).toEqual(["other", "tagged"]);
    expect(listPublished(db, "article", { tag: "sqlite" }).map((p) => p.slug)).toEqual(["tagged"]);
    expect(listTags(db)).toEqual([
      { tag: "部署", count: 2 },
      { tag: "SQLite", count: 1 },
    ]);

    const cs = openChangeSet(db, agent, { kind: "document_edit", title: "改正文" });
    saveDocument(db, agent, { changeSetId: cs.id, documentId, title: "tagged", body: "改过的正文。" });
    expect(getDocumentForEditing(db, { documentId }, cs.id).tags).toEqual(["SQLite", "部署"]);
    saveDocument(db, agent, { changeSetId: cs.id, documentId, title: "tagged", body: "改过的正文。", tags: [] });
    expect(getDocumentForEditing(db, { documentId }, cs.id).tags).toEqual([]);
  });

  it("站长改名、合并、删除标签：一次改完所有用到它的文章", () => {
    publish("a", ["部署", "运维"]);
    publish("b", ["部署"]);
    expectError(() => renameTag(db, agent, "部署", "上线"), "forbidden");

    expect(renameTag(db, OWNER, "部署", "上线").documents).toBe(2);
    expect(getPublishedDocument(db, "a")!.tags).toEqual(["上线", "运维"]);
    expect(getPublishedDocument(db, "a")!.revNo).toBe(2);

    // 合并：改成已有的标签名，不会重复。
    renameTag(db, OWNER, "运维", "上线");
    expect(getPublishedDocument(db, "a")!.tags).toEqual(["上线"]);

    renameTag(db, OWNER, "上线", null);
    expect(listTags(db)).toEqual([]);
    expectError(() => renameTag(db, OWNER, "不存在", "x"), "not_found");
  });

  it("有文章正在别的改动里时，改名整体不做", () => {
    const { documentId } = publish("locked", ["部署"]);
    publish("free", ["部署"]);
    const cs = openChangeSet(db, agent, { kind: "document_edit", title: "Agent 在改" });
    saveDocument(db, agent, { changeSetId: cs.id, documentId, title: "locked", body: "改。" });
    expectError(() => renameTag(db, OWNER, "部署", "上线"), "conflict");
    expect(getPublishedDocument(db, "free")!.tags).toEqual(["部署"]);
  });
});

describe("运营日志", () => {
  it("只列 Agent 的、已批准的改动，带上说明、打回次数和文章", () => {
    publish("first", [], "第一篇，讲为什么做这个站", true);
    const pending = openChangeSet(db, agent, { kind: "article", title: "还在写" });
    saveDocument(db, agent, { changeSetId: pending.id, kind: "article", slug: "pending", title: "pending", body: "x" });
    const { documentId } = publish("second", []);
    editDocumentAsOwner(db, OWNER, { documentId, title: "second", body: "站长改的。" });

    const log = listOperationLog(db);
    expect(log.map((e) => e.title)).toEqual(["新文章：second", "新文章：first"]);
    expect(log[1]).toMatchObject({ summary: "第一篇，讲为什么做这个站", agentName: "Codex", rejectCount: 1 });
    expect(log[1].documents).toEqual([{ title: "first", slug: "first", kind: "article" }]);
  });

  it("涉及私密知识块、读过私密知识块的改动不出现；站长可以手动隐藏", () => {
    const secretCs = openChangeSet(db, agent, { kind: "knowledge", title: "整理私密的东西" });
    const block = createBlock(db, agent, { changeSetId: secretCs.id, type: "experience", title: "私事", body: "私事。", visibility: "private" });
    if (!block.created) throw new Error("没有创建成功");
    submitChangeSet(db, agent, secretCs.id);
    decideChangeSet(db, OWNER, secretCs.id, "approve");

    const readCs = openChangeSet(db, agent, { kind: "article", title: "读过私密块的文章" });
    readBlockAsAgent(db, agent, block.blockId, readCs.id);
    saveDocument(db, agent, { changeSetId: readCs.id, kind: "article", slug: "reader", title: "reader", body: "正文。" });
    submitChangeSet(db, agent, readCs.id);
    decideChangeSet(db, OWNER, readCs.id, "approve");

    const { changeSetId } = publish("visible", []);
    expect(listOperationLog(db).map((e) => e.id)).toEqual([changeSetId]);

    expectError(() => setHiddenFromLog(db, agent, changeSetId, true), "forbidden");
    setHiddenFromLog(db, OWNER, changeSetId, true);
    expect(listOperationLog(db)).toEqual([]);
    setHiddenFromLog(db, OWNER, changeSetId, false);
    expect(listOperationLog(db)).toHaveLength(1);
    // 只是确认上面用到的函数都还能正常调用。
    setBlockVisibility(db, OWNER, block.blockId, "private");
  });

  it("下线的文章不出现在日志条目里；日志页可以关掉", () => {
    publish("gone", []);
    const docId = listPublished(db)[0].id;
    db.$client.prepare("update documents set status = 'unpublished' where id = ?").run(docId);
    expect(listOperationLog(db)[0].documents).toEqual([]);

    expect(getSiteSettings(db).showLog).toBe("on");
    updateSiteSettings(db, OWNER, { showLog: "off" });
    expect(getSiteSettings(db).showLog).toBe("off");
  });
});
