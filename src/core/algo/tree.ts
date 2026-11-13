import { errorsOf, must, parseNumbers } from "./input";
import type { AlgoDef, AlgoInput, Frame, Tone, TreeView } from "./types";

/**
 * 二叉搜索树。先按输入的顺序把所有数插进去，得到最终的树，用它算好每个节点的位置
 * （横向按中序的先后，纵向按深度），之后每一帧只是显示其中一部分节点、换颜色，节点不会乱跳。
 */

const values = (i: AlgoInput) => {
  const r = parseNumbers(i.input, { min: 2, max: 15, lo: -99, hi: 999 });
  if (r.ok && new Set(r.value).size !== r.value.length) return { ok: false as const, error: "二叉搜索树里的数不能重复。" };
  return r;
};
const check = (i: AlgoInput) => errorsOf(values(i));

type Node = { id: number; value: number; left: number | null; right: number | null; parent: number | null; depth: number };

function build(nums: number[]) {
  const nodes: Node[] = [];
  const paths: number[][] = []; // 插入每个数时经过的节点
  nums.forEach((value, id) => {
    const path: number[] = [];
    let cur: number | null = id === 0 ? null : 0;
    let parent: number | null = null;
    let goLeft = false;
    while (cur !== null) {
      path.push(cur);
      parent = cur;
      goLeft = value < nodes[cur].value;
      cur = goLeft ? nodes[cur].left : nodes[cur].right;
    }
    nodes.push({ id, value, left: null, right: null, parent, depth: parent === null ? 0 : nodes[parent].depth + 1 });
    if (parent !== null) {
      if (goLeft) nodes[parent].left = id;
      else nodes[parent].right = id;
    }
    paths.push(path);
  });
  const inorder: number[] = [];
  const walk = (k: number | null) => {
    if (k === null) return;
    walk(nodes[k].left);
    inorder.push(k);
    walk(nodes[k].right);
  };
  walk(0);
  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  const pos = nodes.map((n) => ({
    x: ((inorder.indexOf(n.id) + 0.5) / nodes.length) * 100,
    y: maxDepth === 0 ? 50 : 12 + (n.depth / maxDepth) * 76,
  }));
  return { nodes, paths, pos };
}

function recorder(nums: number[]) {
  const t = build(nums);
  const frames: Frame[] = [];
  const snap = (
    note: string,
    line: number | undefined,
    opts: { count?: number; tones?: Record<number, Tone>; output?: TreeView["output"]; vars?: Record<string, string | number> } = {},
  ) => {
    const count = opts.count ?? t.nodes.length;
    const shown = t.nodes.slice(0, count);
    frames.push({
      view: {
        kind: "tree",
        nodes: shown.map((n) => ({ id: n.id, value: n.value, ...t.pos[n.id], tone: opts.tones?.[n.id] ?? null })),
        edges: shown.filter((n) => n.parent !== null).map((n) => ({ from: n.parent!, to: n.id, tone: opts.tones?.[n.id] && opts.tones?.[n.parent!] ? opts.tones[n.id] : null })),
        output: opts.output,
      },
      note,
      line,
      vars: opts.vars && Object.entries(opts.vars).map(([k, v]) => [k, String(v)]),
    });
  };
  return { ...t, frames, snap };
}

const EXAMPLE = { input: "50,30,70,20,40,60,80,35,45,65" };

export const bstInsert: AlgoDef = {
  name: "bst-insert",
  label: "二叉搜索树：插入",
  group: "树",
  inputHelp: "依次插入的数，逗号分隔，不能重复，2 到 15 个",
  example: EXAMPLE,
  legend: [{ tone: "compare", label: "比较经过" }, { tone: "found", label: "新插入" }],
  code: ["insert(x):", "  cur = root", "  while cur != null:", "    if x < cur.value: cur = cur.left", "    else: cur = cur.right", "  把 x 放在走到的空位上"],
  check,
  run(input) {
    const nums = must(values(input));
    const t = recorder(nums);
    t.snap(`第一个数 ${nums[0]} 做根。之后每个数：比当前节点小往左走，大往右走，走到空位就放下。`, 0, { count: 1, tones: { 0: "found" } });
    for (let k = 1; k < nums.length; k++) {
      const path = t.paths[k];
      const tones: Record<number, Tone> = {};
      path.forEach((p, idx) => {
        tones[p] = "compare";
        const node = t.nodes[p];
        t.snap(`插入 ${nums[k]}：和 ${node.value} 比，${nums[k] < node.value ? "小，往左" : "大，往右"}。`, nums[k] < node.value ? 3 : 4, {
          count: k,
          tones: { ...tones, [p]: "active" },
          vars: { x: nums[k], cur: node.value, 深度: idx },
        });
      });
      t.snap(`走到空位，${nums[k]} 放在这里。`, 5, { count: k + 1, tones: { ...tones, [k]: "found" }, vars: { x: nums[k] } });
    }
    t.snap(`插入完成。左子树的数都比根小，右子树都比根大；这棵树的高度是 ${Math.max(...t.nodes.map((n) => n.depth)) + 1}。`, undefined);
    return t.frames;
  },
};

type Order = "pre" | "in" | "post" | "level";

function traversal(order: Order, name: string, label: string, code: string[], intro: string): AlgoDef {
  return {
    name,
    label,
    group: "树",
    inputHelp: "先按顺序插入这些数建一棵二叉搜索树，再遍历；逗号分隔，不能重复，2 到 15 个",
    example: EXAMPLE,
    legend: [{ tone: "active", label: "当前" }, { tone: "frontier", label: "路过 / 在队列里" }, { tone: "sorted", label: "已输出" }],
    code,
    check,
    run(input) {
      const nums = must(values(input));
      const t = recorder(nums);
      const out: number[] = [];
      const tones: Record<number, Tone> = {};
      const output = () => ({ label: "输出", items: [...out] });
      t.snap(intro, 0, { output: output() });
      const visit = (k: number, line: number) => {
        out.push(t.nodes[k].value);
        tones[k] = "sorted";
        t.snap(`输出 ${t.nodes[k].value}。`, line, { tones: { ...tones, [k]: "active" }, output: output() });
      };
      if (order === "level") {
        const queue = [0];
        while (queue.length) {
          const k = queue.shift()!;
          visit(k, 2);
          for (const c of [t.nodes[k].left, t.nodes[k].right]) {
            if (c === null) continue;
            queue.push(c);
            tones[c] = "frontier";
          }
          if (queue.length) t.snap(`把 ${t.nodes[k].value} 的孩子放进队尾，队列：${queue.map((q) => t.nodes[q].value).join(" ")}。`, 3, { tones: { ...tones }, output: output(), vars: { 队列: queue.map((q) => t.nodes[q].value).join(" ") } });
        }
      } else {
        const walk = (k: number | null) => {
          if (k === null) return;
          if (order !== "pre") {
            tones[k] = "frontier";
            t.snap(`来到 ${t.nodes[k].value}，${order === "in" ? "先去左子树" : "先去左右子树"}。`, 1, { tones: { ...tones, [k]: "active" }, output: output() });
          }
          if (order === "pre") visit(k, 1);
          walk(t.nodes[k].left);
          if (order === "in") visit(k, 2);
          walk(t.nodes[k].right);
          if (order === "post") visit(k, 3);
        };
        walk(0);
      }
      t.snap(`遍历完成：${out.join(" ")}。${order === "in" ? "二叉搜索树的中序遍历正好是从小到大。" : ""}`, undefined, { tones, output: output() });
      return t.frames;
    },
  };
}

export const preorder = traversal("pre", "tree-preorder", "二叉树：前序遍历", ["preorder(node):", "  输出 node", "  preorder(node.left)", "  preorder(node.right)"], "前序：先输出自己，再左子树，再右子树。");
export const inorder = traversal("in", "tree-inorder", "二叉树：中序遍历", ["inorder(node):", "  inorder(node.left)", "  输出 node", "  inorder(node.right)"], "中序：先左子树，再输出自己，再右子树。");
export const postorder = traversal("post", "tree-postorder", "二叉树：后序遍历", ["postorder(node):", "  postorder(node.left)", "  postorder(node.right)", "  输出 node"], "后序：先左右子树，最后输出自己。");
export const levelorder = traversal("level", "tree-levelorder", "二叉树：层序遍历", ["queue = [root]", "while queue 不为空:", "  node = queue.shift(); 输出 node", "  左右孩子依次入队"], "层序：一层一层从左到右，用队列实现。");

export const TREE = [bstInsert, preorder, inorder, postorder, levelorder];
