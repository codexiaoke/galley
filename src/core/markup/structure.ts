import { FLOW_MAX_NODES, parseFlow, type FlowGraph } from "./flow";

/**
 * 几个容器组件对内部结构有要求（steps 里要有代码和有序列表、flow 里要有列表……）。
 * 保存时用这里的函数检查写法，渲染时用同样的函数取出各部分，两边不会对不上。
 * 这里只读语法树，不改它。
 */

type Node = {
  type: string;
  name?: string;
  ordered?: boolean | null;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

const sliceOf = (node: Node, source: string) => source.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);

const isCodeLike = (n: Node) => n.type === "code" || (n.type === "leafDirective" && n.name === "block");

/** 列表项开头的 {1-3}：这一步要高亮的行。 */
export const STEP_LINES_PATTERN = /^\{([\d,\s-]+)\}\s*/;

export type StepsParts = {
  /** 代码在容器子节点里的位置 */
  codeIndex: number;
  /** 有序列表在容器子节点里的位置 */
  listIndex: number;
  /** 每一步要高亮的行，原样的写法，例如 "1,3-5"；没写时为空字符串 */
  lines: string[];
};

export function readSteps(container: Node, source: string): { parts?: StepsParts; errors: string[] } {
  const children = container.children ?? [];
  const codeIndex = children.findIndex(isCodeLike);
  const listIndex = children.findIndex((n) => n.type === "list");
  const errors: string[] = [];
  if (codeIndex === -1) errors.push("steps 里要先放一个代码块（``` 代码块，或者 ::block 嵌入的代码知识块）。");
  if (listIndex === -1) errors.push("steps 里要有一个有序列表，每一项是一步，例如「1. {2-3} 这一步做了什么」。");
  if (errors.length) return { errors };
  const list = children[listIndex];
  if (!list.ordered) errors.push("steps 里的步骤要写成有序列表（1. 2. 3.）。");
  const items = list.children ?? [];
  if (items.length < 2) errors.push("steps 至少要有两步，只有一步时直接写成普通的代码块和说明。");
  const lines = items.map((item) => {
    const first = item.children?.[0];
    const m = first ? STEP_LINES_PATTERN.exec(sliceOf(first, source)) : null;
    return m ? m[1].replace(/\s+/g, "") : "";
  });
  if (lines.every((l) => !l)) errors.push("steps 的每一步要以花括号里的行号开头，例如「1. {2-3} 说明」，读者读到这一步时会高亮这几行。");
  return { parts: { codeIndex, listIndex, lines }, errors };
}

export function readFlow(container: Node, source: string): { graph?: FlowGraph; errors: string[] } {
  const list = (container.children ?? []).find((n) => n.type === "list");
  if (!list) return { errors: ["flow 里要写一个列表，每项一条连线，例如「- 甲 -> 乙: 说明」。"] };
  const lines = (list.children ?? []).map((item) => {
    const first = item.children?.[0];
    return first ? sliceOf(first, source).replace(/\s*\n\s*/g, " ") : "";
  });
  const { graph, errors } = parseFlow(lines);
  return { graph: graph.nodes.length > 0 && graph.nodes.length <= FLOW_MAX_NODES ? graph : undefined, errors };
}

export function readTabs(container: Node): { errors: string[] } {
  const children = container.children ?? [];
  const tabs = children.filter((n) => n.type === "containerDirective" && n.name === "tab");
  const errors: string[] = [];
  if (tabs.length < 2) errors.push("tabs 里至少要有两页。外层写 ::::tabs（四个冒号），每页写成 :::tab{label=名字} 内容 :::（三个冒号），外层的冒号必须比里层多。");
  if (tabs.length !== children.length) errors.push("tabs 里只能放 :::tab，其他内容要放进某一页里。");
  return { errors };
}

/** 保存时对容器组件内部结构的检查，返回错误信息。 */
export function checkStructure(name: string, node: Node, source: string): string[] {
  if (name === "steps") return readSteps(node, source).errors;
  if (name === "flow") return readFlow(node, source).errors;
  if (name === "tabs") return readTabs(node).errors;
  return [];
}
