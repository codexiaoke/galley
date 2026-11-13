/**
 * 算法动画的数据结构。
 *
 * 每种算法根据作者给的输入，生成一串"帧"：每一帧是某一时刻的画面（数组、迷宫、图、树、表格、链表），
 * 加上一句说明、当前执行到伪代码的哪一行、几个变量的值。页面上的播放器只负责把这些帧画出来、
 * 在帧之间做过渡动画，不运行任何作者写的代码。
 */

/** 元素的状态，决定画成什么颜色。图例里的文字由各算法自己给。 */
export type Tone =
  | "compare" // 正在比较
  | "swap" // 正在交换 / 移动
  | "sorted" // 已经排好 / 已经确定
  | "pivot" // 基准、最小值等特殊的那一个
  | "active" // 当前处理的
  | "found" // 找到了 / 结果
  | "dim" // 不在当前范围里
  | "visited" // 已经访问过
  | "frontier" // 在队列 / 栈里，等待访问
  | "path"; // 最终路径

export type ArrayItem = { id: number; value: number | string };

export type ArrayView = {
  kind: "array";
  /** bars：高度表示大小（排序）；boxes：一格一格的方块（查找、双指针、栈） */
  style: "bars" | "boxes";
  items: ArrayItem[];
  tones: (Tone | null)[];
  /** 指向某个下标的箭头，例如 i、j、lo、hi */
  pointers: { name: string; index: number }[];
  /** 当前关心的范围，范围外的元素淡下去 */
  range?: [number, number];
  /** 下面的辅助区：归并的临时区、栈、输出序列 */
  aux?: { label: string; items: ArrayItem[]; tones?: (Tone | null)[] };
};

/** 迷宫：一格一个字符。# 墙，. 空地，S 起点，E 终点，v 已访问，f 待访问，c 当前，p 路径 */
export type GridView = { kind: "grid"; rows: number; cols: number; cells: string };

export type GraphNode = { name: string; x: number; y: number; tone: Tone | null; label?: string };
export type GraphEdge = { from: number; to: number; weight?: number; directed: boolean; tone: Tone | null };
export type GraphView = { kind: "graph"; nodes: GraphNode[]; edges: GraphEdge[] };

export type TreeNode = { id: number; value: number; x: number; y: number; tone: Tone | null };
export type TreeView = { kind: "tree"; nodes: TreeNode[]; edges: { from: number; to: number; tone: Tone | null }[]; output?: { label: string; items: (number | string)[] } };

export type TableView = {
  kind: "table";
  rowHead: string[];
  colHead: string[];
  cells: (number | string | null)[][];
  /** "行,列" -> 状态 */
  tones: Record<string, Tone>;
};

export type ListView = {
  kind: "list";
  nodes: { id: number; value: number | string }[];
  /** next[i]：第 i 个节点指向的节点下标，null 表示空 */
  next: (number | null)[];
  pointers: { name: string; index: number | null }[];
  tones: (Tone | null)[];
};

/** 把数组画成完全二叉树（堆）：第 i 个的孩子是 2i+1 和 2i+2。和数组共用元素和状态。 */
export type HeapView = { kind: "heap"; items: ArrayItem[]; tones: (Tone | null)[]; range?: [number, number] };

export type View = ArrayView | GridView | GraphView | TreeView | TableView | ListView | HeapView;

export type Frame = {
  view: View;
  /** 同时显示的其他结构（例如堆排序：数组下面再画一棵树），和 view 一起变化 */
  extra?: View[];
  /** 这一步在做什么，一句话 */
  note: string;
  /** 伪代码里正在执行的行（从 0 开始） */
  line?: number;
  /** 变量面板：名字和值 */
  vars?: [string, string][];
};

export type AlgoInput = { input: string; target?: string; start?: string };

export type AlgoDef = {
  name: string;
  /** 中文名，显示在播放器标题栏 */
  label: string;
  group: string;
  /** 给 Agent 看的说明：输入怎么写 */
  inputHelp: string;
  example: AlgoInput;
  /** 伪代码，一行一个字符串 */
  code: string[];
  legend: { tone: Tone; label: string }[];
  /** 检查输入，返回错误信息；没有问题时返回空数组 */
  check: (input: AlgoInput) => string[];
  run: (input: AlgoInput) => Frame[];
};

/** 帧数上限：防止输入过大时生成太多帧。 */
export const MAX_FRAMES = 600;
