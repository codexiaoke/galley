import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { parseMarkup } from "../markup/parse";
import { plainText } from "../markup/text";
import { authenticateAgent, createAgent } from "../services/agents";
import { createBlock } from "../services/blocks";
import { decideChangeSet, openChangeSet, submitChangeSet } from "../services/changeSets";
import { getPublishedDocument, previewDocumentBody, saveDocument, setDocumentPublished } from "../services/documents";

let db: Db;
let agent: Actor;

function publish(slug: string, body: string, summary = "") {
  const cs = openChangeSet(db, agent, { kind: "article", title: slug });
  const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title: `标题：${slug}`, summary, body });
  if (!saved.saved) throw new Error(`保存失败：${JSON.stringify(saved.issues)}`);
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return saved.documentId;
}

beforeEach(() => {
  db = openDb(":memory:");
  agent = authenticateAgent(db, createAgent(db, OWNER, "Codex").token)!;
});

describe("组件", () => {
  it("时间线不需要参数；写成单行的形式会提醒", () => {
    expect(parseMarkup(":::timeline\n- **2025**　开始。\n- **2026**　开源。\n:::").issues).toEqual([]);
    expect(parseMarkup("::timeline").issues[0].message).toMatch(/:::timeline/);
  });

  it("引文只接受观点、经历、事实、概念类的知识块", () => {
    const cs = openChangeSet(db, agent, { kind: "knowledge", title: "整理" });
    const opinion = createBlock(db, agent, { changeSetId: cs.id, type: "opinion", title: "观点", body: "我认为要耐看。" });
    const data = createBlock(db, agent, { changeSetId: cs.id, type: "data", title: "数据", body: "一组数", data: { columns: ["a", "b"], rows: [["x", 1]] }, sources: [{ url: "https://example.com" }] });
    if (!opinion.created || !data.created) throw new Error("没有创建成功");
    expect(previewDocumentBody(db, `::quote{b=${opinion.blockId}}`, cs.id).issues).toEqual([]);
    expect(previewDocumentBody(db, `::quote{b=${data.blockId}}`, cs.id).issues[0].message).toMatch(/不能用于 quote/);
  });

  it("文章卡片要引用已发布的文章；那篇下线了，卡片就不再显示", () => {
    const target = publish("target", "被引用的文章。", "一句摘要");
    expect(previewDocumentBody(db, "::post{slug=nope}").issues[0].message).toMatch(/不是已发布的文章/);
    expect(previewDocumentBody(db, "::post{slug=Bad_Slug}").issues[0].message).toMatch(/post 的参数不合法/);

    publish("reader", "延伸阅读：\n\n::post{slug=target}");
    expect(getPublishedDocument(db, "reader")!.posts.target).toMatchObject({ title: "标题：target", summary: "一句摘要" });

    setDocumentPublished(db, OWNER, target, false);
    expect(getPublishedDocument(db, "reader")!.posts).toEqual({});
  });

  it("支持 Markdown 表格；搜索用的纯文字里格子之间有空格", () => {
    const table = "| 方案 | 结论 |\n|---|---|\n| SQLite | 够用 |";
    expect(parseMarkup(table).issues).toEqual([]);
    expect(plainText(table).replace(/\s+/g, " ").trim()).toBe("方案 结论 SQLite 够用");
  });
});
