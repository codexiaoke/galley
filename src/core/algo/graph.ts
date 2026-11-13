import { errorsOf, must, parseGraph, type Graph, type Parsed } from "./input";
import type { AlgoDef, AlgoInput, Frame, GraphView, Tone } from "./types";

/**
 * 图算法。节点排在一个圆上（坐标是 0~100 的比例，页面上按实际宽度缩放），
 * 每一帧给出每个节点、每条边的状态。
 */

/**
 * 节点的位置。全是有向边、又没有环的图（比如依赖关系、客户→订单→商品）按层从左到右排，
 * 每一层竖着排开：箭头都朝右，一眼能看出先后。其余的排在一个圆上。
 */
export function layoutGraph(nodes: number, edges: { from: number; to: number; directed: boolean }[]): { x: number; y: number }[] {
  const layered = edges.length > 0 && edges.every((e) => e.directed) ? layers(nodes, edges) : null;
  if (!layered) {
    return Array.from({ length: nodes }, (_, i) => {
      const a = -Math.PI / 2 + (i / nodes) * Math.PI * 2;
      return { x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) };
    });
  }
  const count = Math.max(...layered) + 1;
  const byLayer: number[][] = Array.from({ length: count }, () => []);
  layered.forEach((l, i) => byLayer[l].push(i));
  // 同一层按上一层连过来的节点的平均位置排，减少交叉
  const rank = new Map<number, number>();
  byLayer.forEach((list, l) => {
    if (l > 0) {
      const score = (v: number) => {
        const from = edges.filter((e) => e.to === v).map((e) => rank.get(e.from) ?? 0);
        return from.length ? from.reduce((a, b) => a + b, 0) / from.length : 0;
      };
      list.sort((a, b) => score(a) - score(b) || a - b);
    }
    list.forEach((v, k) => rank.set(v, k / Math.max(1, list.length - 1)));
  });
  // 画布的宽度随层数增加（每层大约 40），节点之间竖着的间距固定，整层上下居中
  const width = Math.max(100, count * 40);
  const tallest = Math.max(...byLayer.map((l) => l.length));
  const gap = Math.min(26, 80 / Math.max(1, tallest - 1));
  const pos = new Array<{ x: number; y: number }>(nodes);
  byLayer.forEach((list, l) => {
    list.forEach((v, k) => {
      pos[v] = { x: 10 + (count === 1 ? (width - 20) / 2 : (l / (count - 1)) * (width - 20)), y: 50 + (k - (list.length - 1) / 2) * gap };
    });
  });
  return pos;
}

/** 最长路径分层；有环时返回 null */
function layers(nodes: number, edges: { from: number; to: number }[]): number[] | null {
  const indeg = new Array(nodes).fill(0);
  edges.forEach((e) => indeg[e.to]++);
  const queue = indeg.flatMap((d, i) => (d === 0 ? [i] : []));
  const layer = new Array(nodes).fill(0);
  let seen = 0;
  while (queue.length) {
    const u = queue.shift()!;
    seen++;
    for (const e of edges) {
      if (e.from !== u) continue;
      layer[e.to] = Math.max(layer[e.to], layer[u] + 1);
      if (--indeg[e.to] === 0) queue.push(e.to);
    }
  }
  return seen === nodes ? layer : null;
}

function layout(g: Graph): { x: number; y: number }[] {
  return layoutGraph(g.nodes.length, g.edges);
}

function recorder(g: Graph) {
  const pos = layout(g);
  const frames: Frame[] = [];
  const nodeTone: (Tone | null)[] = g.nodes.map(() => null);
  const edgeTone: (Tone | null)[] = g.edges.map(() => null);
  const labels: (string | undefined)[] = g.nodes.map(() => undefined);
  const snap = (note: string, line: number | undefined, opts: { nodes?: Record<number, Tone>; edges?: Record<number, Tone>; vars?: Record<string, string | number> } = {}) => {
    const view: GraphView = {
      kind: "graph",
      nodes: g.nodes.map((name, i) => ({ name, ...pos[i], tone: opts.nodes?.[i] ?? nodeTone[i], label: labels[i] })),
      edges: g.edges.map((e, i) => ({ ...e, tone: opts.edges?.[i] ?? edgeTone[i] })),
    };
    frames.push({ view, note, line, vars: opts.vars && Object.entries(opts.vars).map(([k, v]) => [k, String(v)]) });
  };
  return { frames, nodeTone, edgeTone, labels, snap };
}

/** 从 u 出发能走的边：无向边两头都能走，有向边只能顺着走。 */
function adjacent(g: Graph, u: number) {
  const out: { v: number; edge: number; w: number }[] = [];
  g.edges.forEach((e, i) => {
    if (e.from === u) out.push({ v: e.to, edge: i, w: e.weight ?? 1 });
    else if (!e.directed && e.to === u) out.push({ v: e.from, edge: i, w: e.weight ?? 1 });
  });
  return out.sort((a, b) => a.v - b.v);
}

const startOf = (g: Graph, i: AlgoInput) => Math.max(0, g.nodes.indexOf(i.start ?? g.nodes[0]));

const withStart = (r: Parsed<Graph>, i: AlgoInput): string[] => {
  if (!r.ok) return [r.error];
  if (i.start && !r.value.nodes.includes(i.start)) return [`起点 start=${i.start} 不在图里。图里的节点有：${r.value.nodes.join("、")}。`];
  return [];
};

const TRAVERSE_EXAMPLE = { input: "A-B, A-C, B-D, B-E, C-F, E-F, D-G, F-G", start: "A" };
const names = (g: Graph, ids: number[]) => (ids.length ? ids.map((i) => g.nodes[i]).join(" ") : "空");

export const graphBfs: AlgoDef = {
  name: "graph-bfs",
  label: "图的广度优先遍历",
  group: "图",
  inputHelp: '边的列表，"A-B, B-C"（- 无向，> 有向），最多 10 个节点；start 是起点（默认第一个节点）',
  example: TRAVERSE_EXAMPLE,
  legend: [{ tone: "frontier", label: "在队列里" }, { tone: "active", label: "当前" }, { tone: "visited", label: "已访问" }],
  code: ["queue = [start]; 标记 start", "while queue 不为空:", "  u = queue.shift()", "  访问 u", "  for v in u 的邻居:", "    if v 没标记过: 标记 v，入队"],
  check: (i) => withStart(parseGraph(i.input), i),
  run(input) {
    const g = must(parseGraph(input.input));
    const r = recorder(g);
    const s = startOf(g, input);
    const seen = new Set([s]);
    let queue = [s];
    let order = 0;
    r.nodeTone[s] = "frontier";
    r.snap(`从 ${g.nodes[s]} 出发，先访问所有相邻的，再访问相邻的相邻。`, 0, { vars: { 队列: names(g, queue) } });
    while (queue.length) {
      const u = queue[0];
      queue = queue.slice(1);
      r.labels[u] = String(++order);
      r.snap(`取出 ${g.nodes[u]}，它是第 ${order} 个被访问的。`, 3, { nodes: { [u]: "active" }, vars: { 队列: names(g, queue) } });
      const added: number[] = [];
      for (const { v, edge } of adjacent(g, u)) {
        if (seen.has(v)) continue;
        seen.add(v);
        queue.push(v);
        r.nodeTone[v] = "frontier";
        r.edgeTone[edge] = "path";
        added.push(v);
      }
      r.nodeTone[u] = "visited";
      if (added.length) r.snap(`把 ${names(g, added)} 放进队尾。`, 5, { nodes: { [u]: "active" }, vars: { 队列: names(g, queue) } });
    }
    r.snap("队列空了，遍历结束。节点上的数字是访问的顺序，粗线是走过的边。", undefined);
    return r.frames;
  },
};

export const graphDfs: AlgoDef = {
  name: "graph-dfs",
  label: "图的深度优先遍历",
  group: "图",
  inputHelp: graphBfs.inputHelp,
  example: TRAVERSE_EXAMPLE,
  legend: [{ tone: "frontier", label: "在递归栈里" }, { tone: "active", label: "当前" }, { tone: "visited", label: "已访问完" }],
  code: ["dfs(u):", "  标记并访问 u", "  for v in u 的邻居:", "    if v 没访问过: dfs(v)", "  u 的邻居都处理完，返回"],
  check: (i) => withStart(parseGraph(i.input), i),
  run(input) {
    const g = must(parseGraph(input.input));
    const r = recorder(g);
    const s = startOf(g, input);
    const seen = new Set<number>();
    const stack: number[] = [];
    let order = 0;
    r.snap(`从 ${g.nodes[s]} 出发，能往深走就往深走，走到头再退回来。`, 0);
    const dfs = (u: number) => {
      seen.add(u);
      stack.push(u);
      r.labels[u] = String(++order);
      r.nodeTone[u] = "frontier";
      r.snap(`访问 ${g.nodes[u]}（第 ${order} 个）。`, 1, { nodes: { [u]: "active" }, vars: { 递归栈: names(g, stack) } });
      for (const { v, edge } of adjacent(g, u)) {
        if (seen.has(v)) continue;
        r.edgeTone[edge] = "path";
        r.snap(`${g.nodes[v]} 还没去过，从 ${g.nodes[u]} 走过去。`, 3, { nodes: { [u]: "active" }, edges: { [edge]: "active" }, vars: { 递归栈: names(g, stack) } });
        dfs(v);
      }
      stack.pop();
      r.nodeTone[u] = "visited";
      r.snap(`${g.nodes[u]} 的邻居都去过了，退回${stack.length ? ` ${g.nodes[stack[stack.length - 1]]}` : "起点，结束"}。`, 4, { vars: { 递归栈: names(g, stack) } });
    };
    dfs(s);
    r.snap("遍历结束。节点上的数字是访问的顺序。", undefined);
    return r.frames;
  },
};

export const dijkstra: AlgoDef = {
  name: "dijkstra",
  label: "Dijkstra 最短路径",
  group: "图",
  inputHelp: '带权重的边，"A-B:4, B-C:2"（权重是非负整数），最多 10 个节点；start 是起点',
  example: { input: "A-B:4, A-C:2, B-C:1, B-D:5, C-D:8, C-E:10, D-E:2, D-F:6, E-F:2", start: "A" },
  legend: [{ tone: "active", label: "当前确定的" }, { tone: "compare", label: "正在更新" }, { tone: "sorted", label: "已确定最短" }, { tone: "path", label: "最短路径树" }],
  code: [
    "dist[start] = 0，其余 = ∞",
    "while 还有没确定的节点:",
    "  u = 没确定的里 dist 最小的",
    "  确定 u",
    "  for v in u 的邻居:",
    "    if dist[u] + w(u,v) < dist[v]:",
    "      dist[v] = dist[u] + w(u,v); 记下来路",
  ],
  check: (i) => withStart(parseGraph(i.input, { needWeights: true }), i),
  run(input) {
    const g = must(parseGraph(input.input, { needWeights: true }));
    const r = recorder(g);
    const s = startOf(g, input);
    const n = g.nodes.length;
    const dist = new Array(n).fill(Infinity);
    const via: (number | null)[] = new Array(n).fill(null);
    const done = new Set<number>();
    dist[s] = 0;
    const show = () => dist.forEach((d, i) => (r.labels[i] = d === Infinity ? "∞" : String(d)));
    show();
    r.snap(`起点 ${g.nodes[s]} 到自己的距离是 0，到其他点暂时是 ∞。节点旁边的数字是目前知道的最短距离。`, 0);
    while (done.size < n) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done.has(i) && (u === -1 || dist[i] < dist[u])) u = i;
      if (dist[u] === Infinity) {
        r.snap("剩下的节点都到不了。", 2);
        break;
      }
      done.add(u);
      r.nodeTone[u] = "sorted";
      r.snap(`没确定的里面 ${g.nodes[u]} 最近（${dist[u]}），它的最短距离就确定了。`, 3, { nodes: { [u]: "active" }, vars: { u: g.nodes[u], "dist[u]": dist[u] } });
      for (const { v, edge, w } of adjacent(g, u)) {
        if (done.has(v)) continue;
        const cand = dist[u] + w;
        const better = cand < dist[v];
        const old = dist[v];
        if (better) {
          if (via[v] !== null) r.edgeTone[via[v]!] = null;
          dist[v] = cand;
          via[v] = edge;
          r.edgeTone[edge] = "path";
          show();
        }
        r.snap(
          better ? `经过 ${g.nodes[u]} 到 ${g.nodes[v]}：${dist[u]} + ${w} = ${cand}，比原来的 ${old === Infinity ? "∞" : old} 短，更新。` : `经过 ${g.nodes[u]} 到 ${g.nodes[v]}：${dist[u]} + ${w} = ${cand}，不比 ${old} 短，不更新。`,
          better ? 6 : 5,
          { nodes: { [u]: "active", [v]: "compare" }, edges: { [edge]: better ? "path" : "compare" }, vars: { u: g.nodes[u], v: g.nodes[v], "dist[v]": dist[v] } },
        );
      }
    }
    r.snap(`完成。每个节点旁边是从 ${g.nodes[s]} 出发的最短距离，粗线连成的就是最短路径。`, undefined);
    return r.frames;
  },
};

export const topoSort: AlgoDef = {
  name: "topo-sort",
  label: "拓扑排序",
  group: "图",
  inputHelp: '有向边，"穿袜子>穿鞋, 穿裤子>穿鞋"，不能有环，最多 10 个节点',
  example: { input: "内裤>裤子, 裤子>鞋, 袜子>鞋, 裤子>腰带, 衬衫>腰带, 衬衫>领带, 领带>外套, 腰带>外套" },
  legend: [{ tone: "frontier", label: "入度为 0，可以做" }, { tone: "active", label: "当前" }, { tone: "sorted", label: "已排好" }],
  code: [
    "统计每个节点的入度（有几条边指向它）",
    "queue = 入度为 0 的节点",
    "while queue 不为空:",
    "  u = queue.shift(); 输出 u",
    "  for v in u 指向的节点:",
    "    入度[v]--; if 入度[v] == 0: v 入队",
    "输出的个数 < 节点数 → 有环",
  ],
  check: (i) => {
    const r = parseGraph(i.input, { needDirected: true });
    if (!r.ok) return [r.error];
    // 有环时没法排
    const indeg = r.value.nodes.map((_, k) => r.value.edges.filter((e) => e.to === k).length);
    const queue = indeg.flatMap((d, k) => (d === 0 ? [k] : []));
    let count = 0;
    while (queue.length) {
      const u = queue.shift()!;
      count++;
      for (const e of r.value.edges) if (e.from === u && --indeg[e.to] === 0) queue.push(e.to);
    }
    return count < r.value.nodes.length ? ["图里有环，没法做拓扑排序。"] : [];
  },
  run(input) {
    const g = must(parseGraph(input.input, { needDirected: true }));
    const r = recorder(g);
    const indeg = g.nodes.map((_, k) => g.edges.filter((e) => e.to === k).length);
    const out: number[] = [];
    const show = () => indeg.forEach((d, i) => (r.labels[i] = out.includes(i) ? `第${out.indexOf(i) + 1}` : `入度 ${d}`));
    show();
    r.snap("找一个顺序，让每条边都从前指向后：先做没有前置条件的，做完再看谁的前置条件都满足了。", 0);
    const queue = indeg.flatMap((d, k) => (d === 0 ? [k] : []));
    queue.forEach((k) => (r.nodeTone[k] = "frontier"));
    r.snap(`入度为 0 的有：${names(g, queue)}，它们可以先做。`, 1, { vars: { 队列: names(g, queue) } });
    while (queue.length) {
      const u = queue.shift()!;
      out.push(u);
      r.nodeTone[u] = "sorted";
      show();
      r.snap(`输出 ${g.nodes[u]}。`, 3, { nodes: { [u]: "active" }, vars: { 队列: names(g, queue), 已输出: names(g, out) } });
      const freed: number[] = [];
      g.edges.forEach((e, i) => {
        if (e.from !== u) return;
        r.edgeTone[i] = "dim";
        if (--indeg[e.to] === 0) {
          queue.push(e.to);
          r.nodeTone[e.to] = "frontier";
          freed.push(e.to);
        }
      });
      show();
      if (freed.length) r.snap(`去掉 ${g.nodes[u]} 指出去的边，${names(g, freed)} 的入度变成 0，入队。`, 5, { nodes: { [u]: "active" }, vars: { 队列: names(g, queue), 已输出: names(g, out) } });
    }
    r.snap(`完成：${names(g, out)}。`, undefined, { vars: { 顺序: names(g, out) } });
    return r.frames;
  },
};

export const kruskal: AlgoDef = {
  name: "kruskal",
  label: "Kruskal 最小生成树",
  group: "图",
  inputHelp: '带权重的无向边，"A-B:4, B-C:2"，最多 10 个节点',
  example: { input: "A-B:7, A-D:5, B-C:8, B-D:9, B-E:7, C-E:5, D-E:15, D-F:6, E-F:8, E-G:9, F-G:11" },
  legend: [{ tone: "compare", label: "正在考虑" }, { tone: "path", label: "选进生成树" }, { tone: "dim", label: "会成环，丢掉" }],
  code: [
    "把边按权重从小到大排",
    "for (u, v) in 排好的边:",
    "  if u 和 v 不在同一棵树里:",
    "    选这条边; 合并两棵树",
    "  else: 跳过（会成环）",
  ],
  check: (i) => errorsOf(parseGraph(i.input, { needWeights: true, needUndirected: true })),
  run(input) {
    const g = must(parseGraph(input.input, { needWeights: true, needUndirected: true }));
    const r = recorder(g);
    const parent = g.nodes.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const order = g.edges.map((_, i) => i).sort((a, b) => g.edges[a].weight! - g.edges[b].weight!);
    let total = 0;
    let picked = 0;
    r.snap("用最少的总权重把所有节点连起来：每次挑最便宜的边，只要它不会连成环。", 0);
    for (const i of order) {
      const e = g.edges[i];
      const label = `${g.nodes[e.from]}-${g.nodes[e.to]}`;
      r.snap(`看下一条最便宜的边 ${label}（${e.weight}）。`, 2, { edges: { [i]: "compare" }, nodes: { [e.from]: "compare", [e.to]: "compare" }, vars: { 总权重: total } });
      if (find(e.from) !== find(e.to)) {
        parent[find(e.from)] = find(e.to);
        r.edgeTone[i] = "path";
        r.nodeTone[e.from] = "sorted";
        r.nodeTone[e.to] = "sorted";
        total += e.weight!;
        picked++;
        r.snap(`${g.nodes[e.from]} 和 ${g.nodes[e.to]} 还没连通，选它。`, 3, { vars: { 总权重: total } });
        if (picked === g.nodes.length - 1) break;
      } else {
        r.edgeTone[i] = "dim";
        r.snap(`${g.nodes[e.from]} 和 ${g.nodes[e.to]} 已经连通了，再加这条会成环，跳过。`, 4, { vars: { 总权重: total } });
      }
    }
    r.snap(`完成，最小生成树的总权重是 ${total}。`, undefined, { vars: { 总权重: total } });
    return r.frames;
  },
};

export const GRAPH = [graphBfs, graphDfs, dijkstra, topoSort, kruskal];
