import { errorsOf, must, parseInteger, parsePair, type Parsed } from "./input";
import type { AlgoDef, AlgoInput, Frame, TableView, Tone } from "./types";

/**
 * 动态规划：一格一格把表填满，每填一格，标出它依赖的那几格；最后沿着来路回溯出答案。
 */

function recorder(rowHead: string[], colHead: string[]) {
  const cells: (number | string | null)[][] = rowHead.map(() => colHead.map(() => null));
  const frames: Frame[] = [];
  const kept: Record<string, Tone> = {};
  const snap = (note: string, line: number | undefined, tones: Record<string, Tone> = {}, vars?: Record<string, string | number>) => {
    const view: TableView = { kind: "table", rowHead, colHead, cells: cells.map((r) => [...r]), tones: { ...kept, ...tones } };
    frames.push({ view, note, line, vars: vars && Object.entries(vars).map(([k, v]) => [k, String(v)]) });
  };
  return { cells, frames, kept, snap };
}

const key = (i: number, j: number) => `${i},${j}`;
const chars = (s: string) => [...s];

export const lcs: AlgoDef = {
  name: "lcs",
  label: "最长公共子序列",
  group: "动态规划",
  inputHelp: '两个字符串，逗号隔开，例如 "ABCBDAB,BDCABA"，每个最多 10 个字符',
  example: { input: "ABCBDAB,BDCABA" },
  legend: [{ tone: "active", label: "正在填" }, { tone: "compare", label: "依赖的格子" }, { tone: "path", label: "回溯路径" }, { tone: "found", label: "公共字符" }],
  code: [
    "dp[i][0] = dp[0][j] = 0",
    "for i in 1..m, j in 1..n:",
    "  if a[i] == b[j]:",
    "    dp[i][j] = dp[i-1][j-1] + 1",
    "  else:",
    "    dp[i][j] = max(dp[i-1][j], dp[i][j-1])",
    "从右下角往回走，斜着走的地方就是公共字符",
  ],
  check: (i) => errorsOf(parsePair(i.input)),
  run(input) {
    const [a, b] = must(parsePair(input.input)).map(chars);
    const t = recorder(["", ...a], ["", ...b]);
    const dp = t.cells as number[][];
    for (let i = 0; i <= a.length; i++) dp[i][0] = 0;
    for (let j = 0; j <= b.length; j++) dp[0][j] = 0;
    t.snap("dp[i][j] 表示 a 的前 i 个字符和 b 的前 j 个字符的最长公共子序列长度。第一行、第一列是空串，都是 0。", 0);
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
          t.snap(`${a[i - 1]} = ${b[j - 1]}，取左上角 + 1 = ${dp[i][j]}。`, 3, { [key(i, j)]: "active", [key(i - 1, j - 1)]: "compare" }, { i, j });
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          t.snap(`${a[i - 1]} ≠ ${b[j - 1]}，取上面和左边较大的 ${dp[i][j]}。`, 5, { [key(i, j)]: "active", [key(i - 1, j)]: "compare", [key(i, j - 1)]: "compare" }, { i, j });
        }
      }
    }
    let i = a.length;
    let j = b.length;
    const result: string[] = [];
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        t.kept[key(i, j)] = "found";
        result.unshift(a[i - 1]);
        i--;
        j--;
      } else {
        t.kept[key(i, j)] = "path";
        if (dp[i - 1][j] >= dp[i][j - 1]) i--;
        else j--;
      }
      t.snap(`回溯：${result.length ? `已经找到 ${result.join("")}` : "从右下角出发"}。`, 6, {}, { 结果: result.join("") || "—" });
    }
    t.snap(`最长公共子序列是 ${result.join("")}，长度 ${result.length}。`, undefined, {}, { 结果: result.join("") });
    return t.frames;
  },
};

export const editDistance: AlgoDef = {
  name: "edit-distance",
  label: "编辑距离",
  group: "动态规划",
  inputHelp: '两个字符串，逗号隔开，例如 "kitten,sitting"，每个最多 10 个字符',
  example: { input: "kitten,sitting" },
  legend: [{ tone: "active", label: "正在填" }, { tone: "compare", label: "依赖的格子" }, { tone: "path", label: "回溯路径" }],
  code: [
    "dp[i][0] = i; dp[0][j] = j",
    "for i in 1..m, j in 1..n:",
    "  if a[i] == b[j]: dp[i][j] = dp[i-1][j-1]",
    "  else: dp[i][j] = 1 + min(",
    "    dp[i-1][j],     // 删除",
    "    dp[i][j-1],     // 插入",
    "    dp[i-1][j-1])   // 替换",
  ],
  check: (i) => errorsOf(parsePair(i.input)),
  run(input) {
    const [a, b] = must(parsePair(input.input)).map(chars);
    const t = recorder(["", ...a], ["", ...b]);
    const dp = t.cells as number[][];
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    t.snap("dp[i][j] 是把 a 的前 i 个字符改成 b 的前 j 个字符最少要几步（插入、删除、替换各算一步）。和空串比，长度就是步数。", 0);
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
          t.snap(`${a[i - 1]} = ${b[j - 1]}，不用改，等于左上角 ${dp[i][j]}。`, 2, { [key(i, j)]: "active", [key(i - 1, j - 1)]: "compare" }, { i, j });
        } else {
          const del = dp[i - 1][j];
          const ins = dp[i][j - 1];
          const rep = dp[i - 1][j - 1];
          dp[i][j] = 1 + Math.min(del, ins, rep);
          const how = rep <= del && rep <= ins ? "替换" : del <= ins ? "删除" : "插入";
          t.snap(`${a[i - 1]} ≠ ${b[j - 1]}，三个方向里最小的是 ${Math.min(del, ins, rep)}（${how}），再加 1 = ${dp[i][j]}。`, 3, { [key(i, j)]: "active", [key(i - 1, j)]: "compare", [key(i, j - 1)]: "compare", [key(i - 1, j - 1)]: "compare" }, { i, j });
        }
      }
    }
    let i = a.length;
    let j = b.length;
    t.kept[key(i, j)] = "path";
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
        i--;
        j--;
      } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
        i--;
        j--;
      } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) i--;
      else j--;
      t.kept[key(i, j)] = "path";
    }
    t.snap(`把 ${a.join("")} 变成 ${b.join("")} 最少要 ${dp[a.length][b.length]} 步。高亮的格子是其中一种改法。`, undefined, {}, { 编辑距离: dp[a.length][b.length] });
    return t.frames;
  },
};

type Item = { w: number; v: number };
const items = (i: AlgoInput): Parsed<Item[]> => {
  const parts = i.input.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const out: Item[] = [];
  for (const p of parts) {
    const m = /^(\d+)\s*[:：]\s*(\d+)$/.exec(p);
    if (!m) return { ok: false, error: `物品写成 "重量:价值"，用逗号隔开，例如 "2:3,3:4,4:5"。看不懂 "${p}"。` };
    out.push({ w: Number(m[1]), v: Number(m[2]) });
  }
  if (out.length < 2 || out.length > 6) return { ok: false, error: "物品要有 2 到 6 个。" };
  if (out.some((x) => x.w < 1 || x.w > 12 || x.v > 999)) return { ok: false, error: "重量要在 1 到 12 之间，价值不超过 999。" };
  return { ok: true, value: out };
};

export const knapsack: AlgoDef = {
  name: "knapsack",
  label: "0-1 背包",
  group: "动态规划",
  inputHelp: '物品 "重量:价值"，逗号隔开，2 到 6 个；target 是背包容量（1 到 12）',
  example: { input: "2:3,3:4,4:5,5:6", target: "8" },
  legend: [{ tone: "active", label: "正在填" }, { tone: "compare", label: "依赖的格子" }, { tone: "path", label: "回溯路径" }, { tone: "found", label: "装进背包" }],
  code: [
    "dp[0][c] = 0",
    "for i in 1..n, c in 0..W:",
    "  dp[i][c] = dp[i-1][c]          // 不装第 i 个",
    "  if w[i] <= c:",
    "    dp[i][c] = max(dp[i][c], dp[i-1][c-w[i]] + v[i])   // 装",
    "从右下角回溯，值变了的那一行就是装了",
  ],
  check: (i) => errorsOf(items(i), parseInteger(i.target, "target", 1, 12)),
  run(input) {
    const list = must(items(input));
    const W = Number(input.target);
    const t = recorder(["无", ...list.map((x, k) => `#${k + 1} ${x.w}/${x.v}`)], Array.from({ length: W + 1 }, (_, c) => String(c)));
    const dp = t.cells as number[][];
    for (let c = 0; c <= W; c++) dp[0][c] = 0;
    t.snap(`dp[i][c] 是只用前 i 个物品、容量为 c 时能装的最大价值。行头是「重量/价值」。`, 0);
    for (let i = 1; i <= list.length; i++) {
      const { w, v } = list[i - 1];
      for (let c = 0; c <= W; c++) {
        const skip = dp[i - 1][c];
        if (w <= c && dp[i - 1][c - w] + v > skip) {
          dp[i][c] = dp[i - 1][c - w] + v;
          t.snap(`容量 ${c}：装第 ${i} 个（${dp[i - 1][c - w]} + ${v} = ${dp[i][c]}）比不装（${skip}）好。`, 4, { [key(i, c)]: "active", [key(i - 1, c)]: "compare", [key(i - 1, c - w)]: "compare" }, { i, c });
        } else {
          dp[i][c] = skip;
          t.snap(w > c ? `容量 ${c} 装不下重 ${w} 的第 ${i} 个，和上一行一样。` : `容量 ${c}：装第 ${i} 个不划算，保持 ${skip}。`, w > c ? 2 : 4, { [key(i, c)]: "active", [key(i - 1, c)]: "compare", ...(w <= c ? { [key(i - 1, c - w)]: "compare" as Tone } : {}) }, { i, c });
        }
      }
    }
    let c = W;
    const chosen: number[] = [];
    for (let i = list.length; i > 0; i--) {
      if (dp[i][c] !== dp[i - 1][c]) {
        t.kept[key(i, c)] = "found";
        chosen.unshift(i);
        c -= list[i - 1].w;
      } else t.kept[key(i, c)] = "path";
      t.snap(`回溯到第 ${i} 行：${chosen.includes(i) ? `值变了，说明装了第 ${i} 个。` : "值没变，没装。"}`, 5, {}, { 已选: chosen.map((k) => `#${k}`).join(" ") || "—" });
    }
    t.snap(`最大价值是 ${dp[list.length][W]}，装第 ${chosen.join("、")} 个物品。`, undefined, {}, { 最大价值: dp[list.length][W] });
    return t.frames;
  },
};

export const DP = [lcs, editDistance, knapsack];
