import { describe, expect, it } from "vitest";
import { parseTraceInput, runTrace, runTraces } from "../algo/trace";
import { traceCache, traceKey } from "../algo/trace-shared";
import type { ArrayView, GraphView, GridView, HeapView, TableView, TreeView } from "../algo/types";
import { parseMarkup } from "../markup/parse";

const BUBBLE = `const a = array(input)
for (let i = 0; i < a.length - 1; i++) {
  for (let j = 0; j < a.length - 1 - i; j++) {
    vars({ i, j })
    if (compare(j, j + 1) > 0) swap(j, j + 1)
  }
  mark(a.length - 1 - i, "sorted")
}
mark(0, "sorted")
step("排好了")`;

const ok = async (code: string, input?: string) => {
  const r = await runTrace(code, input);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("代码驱动的动画", () => {
  it("按代码实际运行的过程记录每一帧，行号对应调用的那一行", async () => {
    const r = await ok(BUBBLE, "5,1,4,2,8");
    const last = r.frames.at(-1)!.view as ArrayView;
    expect(last.items.map((x) => x.value)).toEqual([1, 2, 4, 5, 8]);
    expect(last.tones.every((t) => t === "sorted")).toBe(true);
    const first = r.frames[0];
    expect(first.line).toBe(4); // compare 在第 5 行（从 0 数是 4）
    expect(first.note).toMatch(/比较 a\[0\] = 5 和 a\[1\] = 1/);
    expect(first.vars).toEqual([["i", "0"], ["j", "0"]]);
    expect(r.frames.some((f) => f.line === 4 && /交换/.test(f.note) === false)).toBe(true);
    expect(r.legend.map((l) => l.tone)).toEqual(["compare", "swap", "sorted"]);
  });

  it("代码改了，动画跟着变", async () => {
    const insertion = `const a = array(input)
for (let i = 1; i < a.length; i++)
  for (let j = i; j > 0 && compare(j - 1, j) > 0; j--) swap(j - 1, j)`;
    const r = await ok(insertion, "3,2,1");
    expect(r.frames.filter((f) => /交换/.test(f.note))).toHaveLength(3);
    expect(r.frames.every((f) => f.line === 2)).toBe(true);
  });

  it("交换时元素带着编号走，页面上才能画出移动", async () => {
    const r = await ok("const a = array([10, 20, 30])\nswap(0, 2)", undefined);
    const v = r.frames[0].view as ArrayView;
    expect(v.items).toEqual([{ id: 2, value: 30 }, { id: 1, value: 20 }, { id: 0, value: 10 }]);
  });

  it("出错时报出第几行", async () => {
    expect(await runTrace("const a = array([1, 2])\nfoo()")).toMatchObject({ ok: false, error: expect.stringMatching(/^第 2 行：ReferenceError/) });
    expect(await runTrace("const a = array([1, 2])\nswap(0, 5)")).toMatchObject({ ok: false, error: expect.stringMatching(/第 2 行：swap\(\) 的下标 5 超出了数组范围/) });
    expect(await runTrace("const a = array([1, 2])")).toMatchObject({ ok: false, error: expect.stringMatching(/一步都没有记录/) });
    expect(await runTrace("let x = 1\nstep('x')")).toMatchObject({ ok: false, error: expect.stringMatching(/先用 array\(\)/) });
  });

  it("死循环会被打断，沙箱里没有网络和文件", async () => {
    const loop = await runTrace("const a = array([1])\nwhile (true) {}");
    expect(loop).toMatchObject({ ok: false, error: expect.stringMatching(/死循环/) });
    expect(await runTrace("const a = array([1])\nfetch('https://example.com')")).toMatchObject({ ok: false, error: expect.stringMatching(/fetch/) });
    expect(await runTrace("const a = array([1])\nrequire('fs')")).toMatchObject({ ok: false, error: expect.stringMatching(/require/) });
    const tooMany = await runTrace("const a = array([1, 2])\nfor (;;) compare(0, 1)");
    expect(tooMany).toMatchObject({ ok: false, error: expect.stringMatching(/超过了 800 步/) });
  }, 10000);

  it("表格和网格", async () => {
    const t = await ok(`const t = table(2, 3, { colHead: ["", "a", "b"] })
t.set(0, 0, 0)
t.set(1, 1, 1, { from: [[0, 0]], note: "左上角加一" })`);
    const v = t.frames.at(-1)!.view as TableView;
    expect(v.tones).toEqual({ "0,0": "compare", "1,1": "active" });
    expect(t.frames.at(-1)!.note).toBe("左上角加一");

    const g = await ok(`const g = grid("S.#/..E")
g.visit(0, 1)
g.path(1, 1, "到了")`);
    expect((g.frames.at(-1)!.view as GridView).cells).toBe("Sv#.pE");
  });

  it("input：逗号分隔的数字是数组，JSON 按 JSON，其余是字符串", () => {
    expect(parseTraceInput("3, 1,2")).toEqual([3, 1, 2]);
    expect(parseTraceInput('{"n": 4}')).toEqual({ n: 4 });
    expect(parseTraceInput("hello")).toBe("hello");
    expect(parseTraceInput(undefined)).toBeNull();
  });

  it("保存前跑过代码，代码出错时正文检查会报错", async () => {
    const good = ":::trace{input=\"3,1,2\"}\n```js\n" + BUBBLE + "\n```\n:::";
    const bad = ":::trace\n```js\nconst a = array([1, 2])\nnope()\n```\n:::";
    await runTraces(good + "\n\n" + bad);
    expect(traceCache.get(traceKey(BUBBLE, "3,1,2"))?.ok).toBe(true);
    expect(parseMarkup(good).issues).toEqual([]);
    expect(parseMarkup(bad).issues[0].message).toMatch(/演示代码出错，第 2 行/);
    expect(parseMarkup(":::trace\n```python\nprint(1)\n```\n:::").issues[0].message).toMatch(/```js/);
    expect(parseMarkup(":::trace\n只有文字\n:::").issues[0].message).toMatch(/只放一个 ```js 代码块/);
  });

  it("图：访问节点、标出边、节点旁边写距离", async () => {
    const r = await ok(`const G = graph("A-B:4, A-C:1, C-B:2")
G.label("A", 0)
G.visit("A", "从 A 出发")
for (const { node, weight } of G.neighbors("A")) G.focusEdge("A", node)
G.markEdge("A", "C", "path")
step("完")`);
    const last = r.frames.at(-1)!.view as GraphView;
    expect(last.nodes.map((n) => n.name)).toEqual(["A", "B", "C"]);
    expect(last.nodes[0]).toMatchObject({ tone: "visited", label: "0" });
    expect(last.edges[1].tone).toBe("path");
    expect(r.frames[0].note).toBe("从 A 出发");
    expect(await runTrace('const G = graph("A-B")\nG.visit("Z")')).toMatchObject({ ok: false, error: expect.stringMatching(/第 2 行：.*Z 不在图里/) });
  });

  it("二叉树：按层建树（空位写 null），加节点时整棵树重新排开", async () => {
    const r = await ok(`const T = tree([5, 3, 8, null, 4])
T.visit(T.root)
const k = T.add(T.right(T.root), "left", 7, "插入 7")
T.focus(k)`);
    const v = r.frames.at(-1)!.view as TreeView;
    expect(v.nodes.map((n) => n.value).sort()).toEqual([3, 4, 5, 7, 8]);
    // 中序排列：横坐标从小到大正好是 3 4 5 7 8
    expect([...v.nodes].sort((a, b) => a.x - b.x).map((n) => n.value)).toEqual([3, 4, 5, 7, 8]);
  });

  it("几种结构可以同时显示，并且一起变化", async () => {
    const r = await ok(`const a = array([3, 1, 2], { heap: true })
const t = table(1, 3)
swap(0, 1)
t.set(0, 0, a[0])`);
    const first = r.frames[0];
    expect(first.view.kind).toBe("array");
    expect(first.extra?.map((v) => v.kind)).toEqual(["heap", "table"]);
    expect((first.extra![0] as HeapView).tones.slice(0, 2)).toEqual(["swap", "swap"]);
    // 第二帧由表格产生：数组上不再有临时的状态
    expect((r.frames[1].view as ArrayView).tones).toEqual([null, null, null]);
    expect(await runTrace("array([1])\narray([2])")).toMatchObject({ ok: false, error: expect.stringMatching(/每种结构只能建一个/) });
  });

  it("trace 的 presets：每组输入各跑一遍，某一组出错时报出是哪一组", async () => {
    const code = "const a = array(input)\nif (a.length > 3) nope()\nstep('ok')";
    const body = ":::trace{presets=\"短=1,2|长=1,2,3,4\"}\n```js\n" + code + "\n```\n:::";
    await runTraces(body);
    expect(traceCache.get(traceKey(code, "1,2"))?.ok).toBe(true);
    expect(parseMarkup(body).issues[0].message).toMatch(/「长」这组输入.*第 2 行/);
  });
});

