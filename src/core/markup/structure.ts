import { TRACE_LANGS, traceCache, traceKey } from "../algo/trace-shared";
import { FLOW_MAX_NODES, parseFlow, type FlowGraph } from "./flow";

/**
 * 几个容器组件对内部结构有要求（steps 里要有代码和有序列表、flow 里要有列表……）。
 * 保存时用这里的函数检查写法，渲染时用同样的函数取出各部分，两边不会对不上。
 * 这里只读语法树，不改它。
 */

type Node = {
  type: string;
  name?: string;
  lang?: string | null;
  value?: string;
  attributes?: Record<string, string | null | undefined> | null;
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

/** 代码驱动的动画：里面放一个 ```js 代码块。 */
export function readTrace(container: Node): { code?: string; input?: string; title?: string; errors: string[] } {
  const children = container.children ?? [];
  const codes = children.filter((n) => n.type === "code");
  const input = container.attributes?.input ?? undefined;
  const title = container.attributes?.title ?? undefined;
  if (codes.length !== 1) return { input, title, errors: ["trace 里要放且只放一个 ```js 代码块，写演示用的 JavaScript。"] };
  const code = codes[0];
  if (!TRACE_LANGS.includes((code.lang ?? "").toLowerCase())) return { input, title, errors: ["trace 里的代码块要写成 ```js：演示代码只能用 JavaScript。"] };
  if (children.length !== 1) return { code: code.value, input, title, errors: ["trace 里除了代码块不要放别的内容，说明文字写在 trace 的前后。"] };
  return { code: code.value ?? "", input, title, errors: [] };
}

/** 保存时对容器组件内部结构的检查，返回错误信息。 */
export function checkStructure(name: string, node: Node, source: string): string[] {
  if (name === "steps") return readSteps(node, source).errors;
  if (name === "flow") return readFlow(node, source).errors;
  if (name === "tabs") return readTabs(node).errors;
  if (name === "trace") {
    const t = readTrace(node);
    if (t.errors.length || t.code === undefined) return t.errors;
    // 代码的运行结果：保存前已经在沙箱里跑过（见 algo/trace.ts 的 runTraces），这里只取结果。
    const result = traceCache.get(traceKey(t.code, t.input));
    return result && !result.ok ? [`演示代码出错，${result.error}`] : [];
  }
  return [];
}
