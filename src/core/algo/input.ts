import type { ArrayItem, ArrayView, Frame, Tone } from "./types";

/**
 * 输入的解析。组件参数只能写成一行，所以：
 * - 数组：逗号分隔，"5,2,9,1"
 * - 迷宫：每行用 / 隔开，"S..#/.#../...E"
 * - 图：逗号分隔的边，"A-B:4, B>C"（- 无向，> 有向，冒号后是权重）
 * - 两个字符串：逗号隔开，"kitten,sitting"
 * 解析失败时返回错误信息，保存时会提示 Agent。
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseNumbers(text: string, { min = 2, max = 16, lo = -999, hi = 999 } = {}): Parsed<number[]> {
  const parts = text.split(/[,，\s]+/).filter(Boolean);
  const nums = parts.map(Number);
  if (parts.length === 0 || nums.some((n) => !Number.isFinite(n))) return { ok: false, error: `input 要写成逗号分隔的数字，例如 "5,2,9,1"，现在是 "${text}"。` };
  if (nums.length < min) return { ok: false, error: `至少要有 ${min} 个数。` };
  if (nums.length > max) return { ok: false, error: `最多 ${max} 个数，现在有 ${nums.length} 个。数太多时动画太长，读者看不完。` };
  if (nums.some((n) => n < lo || n > hi || !Number.isInteger(n))) return { ok: false, error: `数字要是 ${lo} 到 ${hi} 之间的整数。` };
  return { ok: true, value: nums };
}

export function parseInteger(text: string | undefined, name: string, lo: number, hi: number): Parsed<number> {
  const n = Number(text);
  if (text === undefined || text === "" || !Number.isInteger(n)) return { ok: false, error: `需要 ${name}，写成整数，例如 ${name}=${lo + 1}。` };
  if (n < lo || n > hi) return { ok: false, error: `${name} 要在 ${lo} 到 ${hi} 之间。` };
  return { ok: true, value: n };
}

export type Maze = { rows: number; cols: number; cells: string[]; start: number; end: number };

export function parseMaze(text: string): Parsed<Maze> {
  const lines = text.split(/[/\n]/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { ok: false, error: '迷宫要写成几行，用 / 隔开，例如 "S..#/.#../...E"。' };
  const cols = lines[0].length;
  if (lines.some((l) => l.length !== cols)) return { ok: false, error: "迷宫每一行的长度要一样。" };
  if (lines.length > 12 || cols > 24) return { ok: false, error: "迷宫最大 12 行、24 列。" };
  const cells = lines.join("").split("");
  if (cells.some((c) => !"#.SE".includes(c))) return { ok: false, error: "迷宫只能用这几个字符：# 墙，. 空地，S 起点，E 终点。" };
  const start = cells.indexOf("S");
  const end = cells.indexOf("E");
  if (start === -1 || end === -1 || cells.lastIndexOf("S") !== start || cells.lastIndexOf("E") !== end) {
    return { ok: false, error: "迷宫里要有且只有一个 S（起点）和一个 E（终点）。" };
  }
  return { ok: true, value: { rows: lines.length, cols, cells, start, end } };
}

export type Graph = { nodes: string[]; edges: { from: number; to: number; weight?: number; directed: boolean }[]; weighted: boolean; directed: boolean };

export function parseGraph(text: string, { needWeights = false, needDirected = false, needUndirected = false } = {}): Parsed<Graph> {
  const parts = text.split(/[,，]/).map((p) => p.trim()).filter(Boolean);
  const nodes: string[] = [];
  const edges: Graph["edges"] = [];
  const node = (name: string) => {
    let i = nodes.indexOf(name);
    if (i === -1) i = nodes.push(name) - 1;
    return i;
  };
  for (const part of parts) {
    const m = /^([^\s\->:]{1,6})\s*(-|>)\s*([^\s\->:]{1,6})\s*(?::\s*(\d+))?$/.exec(part);
    if (m) {
      const from = node(m[1]);
      const to = node(m[3]);
      if (from === to) return { ok: false, error: `"${part}" 的两端是同一个节点。` };
      edges.push({ from, to, weight: m[4] === undefined ? undefined : Number(m[4]), directed: m[2] === ">" });
    } else if (/^[^\s\->:]{1,6}$/.test(part)) {
      node(part);
    } else {
      return { ok: false, error: `看不懂 "${part}"。边写成 "A-B"（无向）或 "A>B"（有向），带权重写成 "A-B:4"；节点名最多 6 个字符。` };
    }
  }
  if (nodes.length < 2) return { ok: false, error: '图至少要有两个节点，例如 "A-B, B-C"。' };
  if (nodes.length > 10) return { ok: false, error: `图最多 10 个节点，现在有 ${nodes.length} 个。` };
  const weighted = edges.length > 0 && edges.every((e) => e.weight !== undefined);
  const directed = edges.length > 0 && edges.every((e) => e.directed);
  if (needWeights && !weighted) return { ok: false, error: '这个算法需要每条边都有权重，写成 "A-B:4"。' };
  if (needDirected && !directed) return { ok: false, error: '这个算法需要有向图，每条边写成 "A>B"。' };
  if (needUndirected && edges.some((e) => e.directed)) return { ok: false, error: '这个算法需要无向图，每条边写成 "A-B"。' };
  return { ok: true, value: { nodes, edges, weighted, directed } };
}

export function parsePair(text: string, maxLength = 10): Parsed<[string, string]> {
  const parts = text.split(/[,，]/).map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'input 要写成用逗号隔开的两个字符串，例如 "ABCBDAB,BDCABA"。' };
  if (parts.some((p) => [...p].length > maxLength)) return { ok: false, error: `每个字符串最多 ${maxLength} 个字符。` };
  return { ok: true, value: [parts[0], parts[1]] };
}

export const errorsOf = (...results: Parsed<unknown>[]) => results.filter((r): r is { ok: false; error: string } => !r.ok).map((r) => r.error);

/** 解析成功时取出值；只在 check 通过之后调用。 */
export function must<T>(r: Parsed<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/**
 * 数组类算法的录制器：维护当前的数组，每调用一次 snap 记一帧。
 * 元素带着不变的编号，交换以后编号跟着走，页面上就能画出元素移动的过程。
 */
export function arrayRecorder(values: (number | string)[], style: ArrayView["style"]) {
  let items: ArrayItem[] = values.map((value, id) => ({ id, value }));
  const done = new Set<number>(); // 已经确定的下标
  const frames: Frame[] = [];

  const snap = (
    note: string,
    line: number | undefined,
    opts: {
      tones?: Record<number, Tone>;
      pointers?: Record<string, number | undefined>;
      range?: [number, number];
      aux?: ArrayView["aux"];
      vars?: Record<string, string | number>;
      doneTone?: Tone;
    } = {},
  ) => {
    const tones = items.map((_, i) => opts.tones?.[i] ?? (done.has(i) ? (opts.doneTone ?? "sorted") : null));
    const pointers = Object.entries(opts.pointers ?? {})
      .filter((e): e is [string, number] => typeof e[1] === "number" && e[1] >= 0 && e[1] < items.length)
      .map(([name, index]) => ({ name, index }));
    frames.push({
      view: {
        kind: "array",
        style,
        items: items.map((x) => ({ ...x })),
        tones,
        pointers,
        range: opts.range,
        aux: opts.aux && { ...opts.aux, items: opts.aux.items.map((x) => ({ ...x })) },
      },
      note,
      line,
      vars: opts.vars && Object.entries(opts.vars).map(([k, v]) => [k, String(v)]),
    });
  };

  return {
    get items() {
      return items;
    },
    set items(next: ArrayItem[]) {
      items = next;
    },
    value: (i: number) => items[i].value as number,
    swap(i: number, j: number) {
      [items[i], items[j]] = [items[j], items[i]];
    },
    done,
    snap,
    frames,
  };
}
