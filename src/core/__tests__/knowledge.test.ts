import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { findTerms, termSpellings, type Term } from "../markup/terms";
import { authenticateAgent, createAgent } from "../services/agents";
import { createBlock, markBlockStale } from "../services/blocks";
import { decideChangeSet, openChangeSet, submitChangeSet } from "../services/changeSets";
import { editDocumentAsOwner, saveDocument } from "../services/documents";
import { listTerms, publicHistory, siteGraph } from "../services/knowledge";
import { layoutGraph } from "../../render/graph-layout";

let db: Db;
let agent: Actor;

function publish(slug: string, title: string, body: string) {
  const cs = openChangeSet(db, agent, { kind: "article", title: `新文章：${slug}` });
  const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title, summary: "", body });
  if (!saved.saved) throw new Error(`保存失败：${JSON.stringify(saved.issues)}`);
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return saved.documentId;
}

function concept(term: string, body: string, aliases: string[] = [], visibility: "public" | "private" = "public") {
  const cs = openChangeSet(db, agent, { kind: "knowledge", title: `概念：${term}` });
  const made = createBlock(db, agent, { changeSetId: cs.id, type: "concept", title: term, body, data: { term, aliases }, visibility });
  if (!made.created) throw new Error("没有创建成功");
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return made.blockId;
}

beforeEach(() => {
  db = openDb(":memory:");
  agent = authenticateAgent(db, createAgent(db, OWNER, "测试 Agent").token)!;
});

describe("术语匹配", () => {
  const terms: Term[] = [
    { id: "a", term: "本体（Ontology）", aliases: ["领域模型"], definition: "" },
    { id: "b", term: "RDF", aliases: [], definition: "" },
    { id: "c", term: "知识图谱", aliases: ["图谱"], definition: "" },
  ];
  const spellings = termSpellings(terms);

  it("括号前后的写法都算；长的写法先匹配", () => {
    expect(spellings.filter((s) => s.id === "a").map((s) => s.text)).toEqual(expect.arrayContaining(["本体（Ontology）", "本体", "Ontology"]));
    const hits = findTerms("知识图谱里的图谱", spellings);
    expect(hits).toEqual([{ start: 0, end: 4, id: "c" }]);
  });

  it("每个术语只标第一次；英文整词匹配、不分大小写", () => {
    const text = "ontology 和本体；RDFS 不是 rdf，RDF 也只标一次";
    const hits = findTerms(text, spellings);
    expect(hits.map((h) => [text.slice(h.start, h.end), h.id])).toEqual([
      ["ontology", "a"],
      ["rdf", "b"],
    ]);
    expect(findTerms(text, spellings, new Set(["a", "b"]))).toEqual([]);
  });
});

describe("读者看到的知识结构", () => {
  it("术语只来自公开、已核实的概念块", () => {
    const visible = concept("本体", "对一个领域的明确描述。", ["领域模型"]);
    concept("私房词", "不公开。", [], "private");
    const stale = concept("旧概念", "可能不对了。");
    markBlockStale(db, OWNER, stale, "过时了");
    expect(listTerms(db).map((t) => t.id)).toEqual([visible]);
    expect(listTerms(db)[0]).toMatchObject({ term: "本体", aliases: ["领域模型"], definition: "对一个领域的明确描述。" });
  });

  it("图谱：文章提到概念、文章互相链接、概念的定义提到别的概念；孤立的点不画", () => {
    const ontology = concept("本体", "对一个领域的明确描述，是知识图谱的骨架。");
    const kg = concept("知识图谱", "用实体和关系连成的一张网。");
    concept("没人提的概念", "孤零零的。");
    const first = publish("first", "第一篇", "讲讲本体。");
    const second = publish("second", "第二篇", "接着 [第一篇](/posts/first) 往下说。");
    publish("alone", "孤立的文章", "什么都没提。");

    const graph = siteGraph(db);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([ontology, kg, first, second].sort());
    const pairs = graph.links.map((l) => `${l.kind}:${[l.source, l.target].sort().join("-")}`);
    expect(pairs).toEqual(
      expect.arrayContaining([`mentions:${[first, ontology].sort().join("-")}`, `links:${[first, second].sort().join("-")}`, `related:${[ontology, kg].sort().join("-")}`]),
    );

    const { positions, height } = layoutGraph(graph, { width: 1000, height: 640 });
    expect(positions).toHaveLength(4);
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(height);
    }
    // 同样的输入，同样的布局
    expect(layoutGraph(graph).positions).toEqual(positions);
  });

  it("修改记录：每一次上线的版本，新的在前，记下改了多少字", () => {
    const id = publish("post", "标题", "第一版的正文。");
    editDocumentAsOwner(db, OWNER, { documentId: id, title: "新标题", body: "第一版的正文，加了一句。" });
    const history = publicHistory(db, "post")!;
    expect(history.title).toBe("新标题");
    expect(history.revisions.map((r) => r.note)).toEqual([expect.any(String), "首次发布"]);
    expect(history.revisions[0].added).toBeGreaterThan(0);
    expect(history.revisions[1].added).toBe(0);
    expect(publicHistory(db, "nope")).toBeUndefined();
  });
});
