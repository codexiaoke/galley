import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { parseMarkup } from "../markup/parse";
import { parseFlow } from "../markup/flow";
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

  it("分步讲解要有代码和带行号的有序列表", () => {
    const ok = ":::steps\n```ts\nconst a = 1;\nconst b = 2;\n```\n\n1. {1} 先定义 a。\n2. {2} 再定义 b。\n:::";
    expect(parseMarkup(ok).issues).toEqual([]);
    expect(parseMarkup(":::steps\n1. {1} 只有步骤。\n2. {2} 没有代码。\n:::").issues[0].message).toMatch(/先放一个代码块/);
    expect(parseMarkup(":::steps\n```ts\nx\n```\n\n1. 没写行号。\n2. 也没写。\n:::").issues[0].message).toMatch(/花括号里的行号/);
    expect(parseMarkup(":::steps\n```ts\nx\n```\n\n- {1} 无序列表\n- {1} 不行\n:::").issues[0].message).toMatch(/有序列表/);
  });

  it("流程图：一行一条连线，可以连写，可以带说明", () => {
    expect(parseMarkup(":::flow\n- 甲 -> 乙: 说明\n- 乙 -> 丙 -> 丁\n:::").issues).toEqual([]);
    expect(parseMarkup(":::flow\n- 甲 -> 甲\n:::").issues[0].message).toMatch(/指向了自己/);
    expect(parseMarkup(":::flow\n:::").issues[0].message).toMatch(/写一个列表/);
    const many = Array.from({ length: 13 }, (_, i) => `- 节点${i} -> 节点${i + 1}`).join("\n");
    expect(parseMarkup(`:::flow\n${many}\n:::`).issues.some((i) => /最多 12 个节点/.test(i.message))).toBe(true);
  });

  it("流程图的说明要用中文冒号或者冒号加空格，localhost:3000 这样的名字不会被拆开", () => {
    const { graph } = parseFlow(["浏览器 -> localhost:3000", "localhost:3000 -> 数据库：查询"]);
    expect(graph.nodes).toEqual(["浏览器", "localhost:3000", "数据库"]);
    expect(graph.edges[1]).toMatchObject({ from: 1, to: 2, label: "查询" });
  });

  it("标签页：外层冒号比里层多；tab 不能单独用", () => {
    expect(parseMarkup("::::tabs\n:::tab{label=甲}\n一\n:::\n:::tab{label=乙}\n二\n:::\n::::").issues).toEqual([]);
    expect(parseMarkup(":::tab{label=甲}\n一\n:::").issues[0].message).toMatch(/只能写在 tabs 里面/);
    expect(parseMarkup("::::tabs\n:::tab{label=甲}\n一\n:::\n::::").issues[0].message).toMatch(/至少要有两页/);
  });

  it("关键数字要取事实块里存在的命名取值", () => {
    const cs = openChangeSet(db, agent, { kind: "knowledge", title: "整理" });
    const fact = createBlock(db, agent, {
      changeSetId: cs.id,
      type: "fact",
      title: "星标",
      body: "项目有一万多个星标",
      data: { values: { stars: "12,480" } },
      sources: [{ url: "https://example.com" }],
    });
    if (!fact.created) throw new Error("没有创建成功");
    expect(previewDocumentBody(db, `::stat{b=${fact.blockId} key=stars label="星标"}`, cs.id).issues).toEqual([]);
    expect(previewDocumentBody(db, `::stat{b=${fact.blockId} key=forks label="分支"}`, cs.id).issues[0].message).toMatch(/没有名为 forks 的取值/);
    expect(parseMarkup(`::stat{b=${fact.blockId} key=stars}`).issues[0].message).toMatch(/stat 的参数不合法/);
  });

  it("前后对比只能用媒体库里的图片", () => {
    expect(parseMarkup("::compare{before=https://x.com/a.png after=/media/b.png}").issues[0].message).toMatch(/媒体库/);
    expect(parseMarkup("::compare{before=/media/a1.png after=/media/b2.png}").images.map((i) => i.name)).toEqual(["a1.png", "b2.png"]);
    expect(previewDocumentBody(db, "::compare{before=/media/a1.png after=/media/b2.png}").issues[0].message).toMatch(/a1\.png/);
  });

  it("折叠段落要有标题", () => {
    expect(parseMarkup(':::fold{title="完整配置"}\n内容\n:::').issues).toEqual([]);
    expect(parseMarkup(":::fold\n内容\n:::").issues[0].message).toMatch(/fold 的参数不合法/);
  });

  it("公式写错时保存就报错，并说明怎么写美元符号", () => {
    expect(parseMarkup("复杂度 $O(n^2)$，还有 $$\\frac{1}{2}$$").issues).toEqual([]);
    const issue = parseMarkup("写错了 $\\frac{1}{2$ 这里").issues[0];
    expect(issue.message).toMatch(/公式写错了/);
    expect(issue.message).toMatch(/美元符号/);
  });

  it("Mermaid 图第一行要是图表类型", () => {
    expect(parseMarkup("```mermaid\nsequenceDiagram\n  A->>B: 你好\n```").issues).toEqual([]);
    expect(parseMarkup("```mermaid\nA --> B\n```").issues[0].message).toMatch(/第一行要写图表类型/);
  });
});

