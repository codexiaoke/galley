import { errorsOf, must, parseMaze, type Maze } from "./input";
import { MAX_FRAMES, type AlgoDef, type AlgoInput, type Frame } from "./types";

/**
 * 迷宫寻路。每一帧把整个迷宫编码成一串字符（见 GridView），上下左右四个方向走。
 */

const MAZE_EXAMPLE = "S..#......../.#.#.#####.#/.#...#...#../.####.#.##.#/......#....E";
const mazeOf = (i: AlgoInput) => parseMaze(i.input);
const check = (i: AlgoInput) => errorsOf(mazeOf(i));

const LEGEND: AlgoDef["legend"] = [
  { tone: "frontier", label: "等待访问" },
  { tone: "visited", label: "已访问" },
  { tone: "active", label: "当前" },
  { tone: "path", label: "路径" },
];

function neighbors(m: Maze, i: number) {
  const r = Math.floor(i / m.cols);
  const c = i % m.cols;
  const out: number[] = [];
  if (r > 0) out.push(i - m.cols);
  if (c < m.cols - 1) out.push(i + 1);
  if (r < m.rows - 1) out.push(i + m.cols);
  if (c > 0) out.push(i - 1);
  return out.filter((k) => m.cells[k] !== "#");
}

function recorder(m: Maze) {
  const state = [...m.cells];
  const frames: Frame[] = [];
  const pos = (i: number) => `(${Math.floor(i / m.cols)}, ${i % m.cols})`;
  const mark = (i: number, code: string) => {
    if (i !== m.start && i !== m.end) state[i] = code;
  };
  const snap = (note: string, line: number | undefined, current?: number, vars?: Record<string, string | number>) => {
    const cells = [...state];
    if (current !== undefined && current !== m.start && current !== m.end) cells[current] = "c";
    if (frames.length < MAX_FRAMES) frames.push({ view: { kind: "grid", rows: m.rows, cols: m.cols, cells: cells.join("") }, note, line, vars: vars && Object.entries(vars).map(([k, v]) => [k, String(v)]) });
  };
  /** 沿着来路往回走，一格一帧画出路径。 */
  const tracePath = (from: Map<number, number>, line: number, extra = "") => {
    const path: number[] = [];
    for (let k: number | undefined = m.end; k !== undefined && k !== m.start; k = from.get(k)) path.unshift(k);
    const step = Math.max(1, Math.ceil(path.length / 12));
    path.forEach((k, idx) => {
      mark(k, "p");
      if (idx % step === step - 1 || idx === path.length - 1) snap(idx === path.length - 1 ? `到达终点，路径长 ${path.length} 步。${extra}` : "沿着记下的来路往回走，画出路径。", line, undefined, { 步数: path.length });
    });
  };
  return { state, frames, mark, snap, tracePath, pos };
}

export const mazeBfs: AlgoDef = {
  name: "maze-bfs",
  label: "广度优先搜索：迷宫最短路",
  group: "迷宫",
  inputHelp: "迷宫，每行用 / 隔开：# 墙，. 空地，S 起点，E 终点，最大 12 行 24 列",
  example: { input: MAZE_EXAMPLE },
  legend: LEGEND,
  code: [
    "queue = [S]; 标记 S 已访问",
    "while queue 不为空:",
    "  cur = queue.shift()   // 先进先出",
    "  if cur == E: 沿来路回溯，得到路径",
    "  for nb in 上下左右的邻居:",
    "    if nb 不是墙 and 没访问过:",
    "      标记 nb，记下来路，入队",
    "没有路",
  ],
  check,
  run(input) {
    const m = must(mazeOf(input));
    const g = recorder(m);
    const from = new Map<number, number>();
    const seen = new Set([m.start]);
    let queue = [m.start];
    g.snap("从起点出发，一圈一圈往外扩。先到的格子一定是最近的。", 0, undefined, { 队列长度: 1 });
    while (queue.length) {
      const cur = queue[0];
      queue = queue.slice(1);
      if (cur === m.end) {
        g.snap("从队列里取出的是终点，找到了。", 3, cur, { 队列长度: queue.length });
        g.tracePath(from, 3, "广度优先第一次到达时，就是最短的。");
        return g.frames;
      }
      g.mark(cur, "v");
      const added: number[] = [];
      for (const nb of neighbors(m, cur)) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        from.set(nb, cur);
        queue.push(nb);
        g.mark(nb, "f");
        added.push(nb);
      }
      g.snap(added.length ? `取出 ${g.pos(cur)}，把 ${added.length} 个没去过的邻居放进队尾。` : `取出 ${g.pos(cur)}，周围没有新的格子。`, added.length ? 6 : 2, cur, { 队列长度: queue.length });
    }
    g.snap("队列空了，起点到不了终点。", 7);
    return g.frames;
  },
};

export const mazeDfs: AlgoDef = {
  name: "maze-dfs",
  label: "深度优先搜索：迷宫",
  group: "迷宫",
  inputHelp: mazeBfs.inputHelp,
  example: { input: MAZE_EXAMPLE },
  legend: LEGEND,
  code: [
    "stack = [S]",
    "while stack 不为空:",
    "  cur = stack.pop()   // 后进先出",
    "  if cur 访问过: continue",
    "  标记 cur 已访问",
    "  if cur == E: 沿来路回溯，得到路径",
    "  for nb in 邻居: if 没访问过: 记下来路，入栈",
    "没有路",
  ],
  check,
  run(input) {
    const m = must(mazeOf(input));
    const g = recorder(m);
    const from = new Map<number, number>();
    const seen = new Set<number>();
    const stack = [m.start];
    g.snap("从起点出发，一条路走到底，走不通再退回来换一条。", 0, undefined, { 栈深度: 1 });
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (cur === m.end) {
        g.snap("走到终点了。", 5, cur, { 栈深度: stack.length });
        g.tracePath(from, 5, "深度优先找到的不一定是最短的路。");
        return g.frames;
      }
      g.mark(cur, "v");
      // 反着压栈，这样先走上、右、下、左的顺序
      const nbs = neighbors(m, cur).filter((nb) => !seen.has(nb)).reverse();
      for (const nb of nbs) {
        from.set(nb, cur);
        stack.push(nb);
        g.mark(nb, "f");
      }
      g.snap(nbs.length ? `走到 ${g.pos(cur)}，继续往深处走。` : `${g.pos(cur)} 是死胡同，退回去换一条路。`, nbs.length ? 6 : 2, cur, { 栈深度: stack.length });
    }
    g.snap("所有能走的都走过了，到不了终点。", 7);
    return g.frames;
  },
};

export const mazeAstar: AlgoDef = {
  name: "maze-astar",
  label: "A* 搜索：迷宫",
  group: "迷宫",
  inputHelp: mazeBfs.inputHelp,
  example: { input: MAZE_EXAMPLE },
  legend: LEGEND,
  code: [
    "open = [S]; g(S) = 0",
    "while open 不为空:",
    "  cur = open 里 f = g + h 最小的",
    "  if cur == E: 回溯得到路径",
    "  for nb in 邻居:",
    "    if g(cur) + 1 < g(nb):",
    "      g(nb) = g(cur) + 1; 记下来路; 放进 open",
    "没有路",
  ],
  check,
  run(input) {
    const m = must(mazeOf(input));
    const g = recorder(m);
    const er = Math.floor(m.end / m.cols);
    const ec = m.end % m.cols;
    const h = (i: number) => Math.abs(Math.floor(i / m.cols) - er) + Math.abs((i % m.cols) - ec);
    const gScore = new Map([[m.start, 0]]);
    const from = new Map<number, number>();
    const open = new Set([m.start]);
    const closed = new Set<number>();
    g.snap("和广度优先一样往外扩，但优先走「已走的步数 g + 估计还要走的步数 h」最小的格子，所以会朝着终点的方向找。h 用横竖距离之和。", 0, undefined, { h: h(m.start) });
    while (open.size) {
      let cur = -1;
      let best = Infinity;
      for (const k of open) {
        const f = gScore.get(k)! + h(k);
        if (f < best || (f === best && h(k) < h(cur))) {
          best = f;
          cur = k;
        }
      }
      open.delete(cur);
      closed.add(cur);
      const vars = { g: gScore.get(cur)!, h: h(cur), f: gScore.get(cur)! + h(cur) };
      if (cur === m.end) {
        g.snap("取出的是终点。", 3, cur, vars);
        g.tracePath(from, 3, `比广度优先少看了不少格子。`);
        return g.frames;
      }
      g.mark(cur, "v");
      for (const nb of neighbors(m, cur)) {
        if (closed.has(nb)) continue;
        const cand = gScore.get(cur)! + 1;
        if (cand < (gScore.get(nb) ?? Infinity)) {
          gScore.set(nb, cand);
          from.set(nb, cur);
          open.add(nb);
          g.mark(nb, "f");
        }
      }
      g.snap(`取出 f 最小的 ${g.pos(cur)}：g = ${vars.g}，h = ${vars.h}。`, 2, cur, vars);
    }
    g.snap("没有路。", 7);
    return g.frames;
  },
};

export const GRID = [mazeBfs, mazeDfs, mazeAstar];
