import { describe, expect, it } from "vitest";
import { ALGORITHMS, checkAlgorithm, describeAlgorithms, runAlgorithm } from "../algo";
import type { ArrayView, Frame } from "../algo/types";
import { parseMarkup } from "../markup/parse";

const framesOf = (name: string, input: Parameters<typeof runAlgorithm>[1]): Frame[] => {
  const r = runAlgorithm(name, input);
  if ("error" in r) throw new Error(r.error);
  return r.frames;
};

describe("算法动画", () => {
  it.each(ALGORITHMS.map((a) => [a.name, a] as const))("%s：例子能跑通，伪代码行号都在范围内", (_, a) => {
    expect(checkAlgorithm(a.name, a.example)).toEqual([]);
    const frames = framesOf(a.name, a.example);
    expect(frames.length).toBeGreaterThan(2);
    for (const f of frames) {
      expect(f.note.length).toBeGreaterThan(0);
      if (f.line !== undefined) expect(f.line).toBeLessThan(a.code.length);
    }
  });

  it.each(["bubble-sort", "selection-sort", "insertion-sort", "quick-sort", "merge-sort", "heap-sort"])("%s 最后一帧是排好的", (name) => {
    for (const input of ["5,1,4,2,8", "9,8,7,6,5,4,3,2,1", "3,3,1,2,1", "1,2,3"]) {
      const last = framesOf(name, { input }).at(-1)!.view as ArrayView;
      const values = last.items.map((x) => x.value as number);
      expect(values).toEqual([...values].sort((a, b) => a - b));
      // 元素编号不丢不重：动画是靠编号追踪每个元素的
      expect(new Set(last.items.map((x) => x.id)).size).toBe(values.length);
    }
  });

  it("二分查找找得到、也能报告找不到", () => {
    expect(framesOf("binary-search", { input: "1,3,5,7,9", target: "7" }).at(-1)!.note).toMatch(/找到了，下标是 3/);
    expect(framesOf("binary-search", { input: "1,3,5,7,9", target: "4" }).at(-1)!.note).toMatch(/没有 4/);
  });

  it("输入有问题时给出能照着改的提示", () => {
    expect(checkAlgorithm("bubble-sort", { input: "3,a,1" })[0]).toMatch(/逗号分隔的数字/);
    expect(checkAlgorithm("bubble-sort", { input: Array.from({ length: 20 }, (_, i) => i).join(",") })[0]).toMatch(/最多 16 个/);
    expect(checkAlgorithm("binary-search", { input: "5,1,3", target: "1" })[0]).toMatch(/有序/);
    expect(checkAlgorithm("binary-search", { input: "1,3,5" })[0]).toMatch(/需要 target/);
    expect(checkAlgorithm("maze-bfs", { input: "S..#/..E" })[0]).toMatch(/长度要一样/);
    expect(checkAlgorithm("maze-bfs", { input: "S..#/...." })[0]).toMatch(/一个 E/);
    expect(checkAlgorithm("dijkstra", { input: "A-B, B-C" })[0]).toMatch(/权重/);
    expect(checkAlgorithm("graph-bfs", { input: "A-B, B-C", start: "Z" })[0]).toMatch(/不在图里/);
    expect(checkAlgorithm("topo-sort", { input: "A>B, B>C, C>A" })[0]).toMatch(/有环/);
    expect(checkAlgorithm("bst-insert", { input: "5,3,5" })[0]).toMatch(/不能重复/);
    expect(checkAlgorithm("knapsack", { input: "2:3,3:4", target: "40" })[0]).toMatch(/target 要在 1 到 12/);
    expect(checkAlgorithm("lcs", { input: "ABC" })[0]).toMatch(/两个字符串/);
  });

  it("迷宫走不通时说清楚", () => {
    expect(framesOf("maze-bfs", { input: "S#./##./..E" }).at(-1)!.note).toMatch(/到不了终点/);
  });

  it("正文里写错算法名或输入，保存时会报错", () => {
    expect(parseMarkup('::algo{type=quick-sort input="5,2,9,1"}').issues).toEqual([]);
    expect(parseMarkup('::algo{type=nope input="1,2"}').issues[0].message).toMatch(/algo 的参数不合法/);
    expect(parseMarkup('::algo{type=binary-search input="1,2,3"}').issues[0].message).toMatch(/二分查找：需要 target/);
  });

  it("给 Agent 的清单里每个例子都能直接用", () => {
    for (const a of describeAlgorithms()) expect(parseMarkup(a.example).issues).toEqual([]);
  });
});
