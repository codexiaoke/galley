import { variantsOf } from "../algo/presets";
import { TRACE_LANGS, traceCache, traceKey } from "../algo/trace-shared";
import { narrationIsLiteral, SCENE_LANGS, sceneCache, sceneKey } from "../scene/shared";
import { SCENE_RATIOS, type SceneRatio } from "../scene/types";
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
  /** 任务列表项（- [ ] / - [x]）是否勾选；普通列表项为 null */
  checked?: boolean | null;
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

/** 代码一步一步演变：里面每个代码块是一步，代码块后面的文字是这一步的讲解。 */
export const CODE_STEPS_MAX = 12;
export const CODE_STEPS_MAX_LINES = 40;

export function readCodeSteps(container: Node): { steps: { code: string; lang: string; meta: string; noteFrom: number; noteTo: number }[]; errors: string[] } {
  const children = container.children ?? [];
  const errors: string[] = [];
  const steps: { code: string; lang: string; meta: string; noteFrom: number; noteTo: number }[] = [];
  if (children[0]?.type !== "code") errors.push("code-steps 里第一个要是代码块：每个代码块是一步，代码块后面写这一步的讲解。");
  children.forEach((n, i) => {
    if (n.type === "code") {
      if (steps.length) steps[steps.length - 1].noteTo = i;
      steps.push({ code: n.value ?? "", lang: n.lang ?? "", meta: (n as { meta?: string | null }).meta ?? "", noteFrom: i + 1, noteTo: children.length });
    }
  });
  if (steps.length < 2) errors.push("code-steps 至少要有两步（两个代码块），只有一步时用普通的代码块。");
  if (steps.length > CODE_STEPS_MAX) errors.push(`code-steps 最多 ${CODE_STEPS_MAX} 步，现在有 ${steps.length} 步。`);
  const long = steps.findIndex((s) => s.code.split("\n").length > CODE_STEPS_MAX_LINES);
  if (long !== -1) errors.push(`第 ${long + 1} 步的代码超过了 ${CODE_STEPS_MAX_LINES} 行。代码讲解要聚焦，只留讲到的那部分。`);
  return { steps, errors };
}

/** 代码驱动的动画：里面放一个 ```js 代码块。 */
export function readTrace(container: Node): { code?: string; input?: string; presets?: string; title?: string; errors: string[] } {
  const children = container.children ?? [];
  const codes = children.filter((n) => n.type === "code");
  const input = container.attributes?.input ?? undefined;
  const title = container.attributes?.title ?? undefined;
  const presets = container.attributes?.presets ?? undefined;
  if (codes.length !== 1) return { input, title, errors: ["trace 里要放且只放一个 ```js 代码块，写演示用的 JavaScript。"] };
  const code = codes[0];
  if (!TRACE_LANGS.includes((code.lang ?? "").toLowerCase())) return { input, title, errors: ["trace 里的代码块要写成 ```js：演示代码只能用 JavaScript。"] };
  if (children.length !== 1) return { code: code.value, input, title, errors: ["trace 里除了代码块不要放别的内容，说明文字写在 trace 的前后。"] };
  return { code: code.value ?? "", input, presets, title, errors: [] };
}

/** 场景动画：里面放一个 ```js 代码块，写摆东西和每一步动作的 JavaScript。 */
export function readScene(container: Node): { code?: string; ratio: SceneRatio; title?: string; errors: string[] } {
  const children = container.children ?? [];
  const codes = children.filter((n) => n.type === "code");
  const title = container.attributes?.title ?? undefined;
  const given = container.attributes?.ratio ?? "16:9";
  const ratio: SceneRatio = given in SCENE_RATIOS ? (given as SceneRatio) : "16:9";
  if (codes.length !== 1) return { ratio, title, errors: ["scene 里要放且只放一个 ```js 代码块，写场景的 JavaScript。"] };
  const code = codes[0];
  if (!SCENE_LANGS.includes((code.lang ?? "").toLowerCase())) return { ratio, title, errors: ["scene 里的代码块要写成 ```js：场景代码只能用 JavaScript。"] };
  if (children.length !== 1) return { code: code.value ?? "", ratio, title, errors: ["scene 里除了代码块不要放别的内容：每一步给读者看的文字写在 step(\"文字\", ...) 里，其余的说明写在 scene 的前后。"] };
  return { code: code.value ?? "", ratio, title, errors: [] };
}

/** 保存时对容器组件内部结构的检查，返回错误信息。 */
export type QuizParts = {
  /** 选项列表在容器子节点里的位置：它前面是题目，后面是解析 */
  listIndex: number;
  /** 正确选项的序号（从 0 开始） */
  correct: number[];
};

/** 小测验：题目、一个任务列表写的选项（- [x] 是正确的，- [ ] 是错的），后面可以跟解析。 */
export function readQuiz(container: Node): { parts?: QuizParts; errors: string[] } {
  const children = container.children ?? [];
  const listIndex = children.findIndex((n) => n.type === "list");
  if (listIndex === -1) return { errors: ["quiz 里要有一个选项列表：正确的写成「- [x] 选项」，错误的写成「- [ ] 选项」。"] };
  const errors: string[] = [];
  if (listIndex === 0) errors.push("quiz 的选项前面要先写题目。");
  const items = children[listIndex].children ?? [];
  if (items.length < 2 || items.length > 6) errors.push("quiz 要有 2 到 6 个选项。");
  if (items.some((i) => i.checked === null || i.checked === undefined)) errors.push("quiz 的每个选项都要写成任务列表：正确的「- [x] 选项」，错误的「- [ ] 选项」（中括号里有空格）。");
  const correct = items.flatMap((i, k) => (i.checked ? [k] : []));
  if (correct.length === 0) errors.push("quiz 至少要有一个正确选项，写成「- [x] 选项」。");
  if (correct.length === items.length && items.length > 0) errors.push("quiz 的选项不能全都正确。");
  if (children.slice(listIndex + 1).some((n) => n.type === "list")) errors.push("一个 quiz 只放一道题。要出几道题就写几个 :::quiz。");
  return { parts: errors.length ? undefined : { listIndex, correct }, errors };
}

export function checkStructure(name: string, node: Node, source: string): string[] {
  if (name === "steps") return readSteps(node, source).errors;
  if (name === "flow") return readFlow(node, source).errors;
  if (name === "tabs") return readTabs(node).errors;
  if (name === "code-steps") return readCodeSteps(node).errors;
  if (name === "quiz") return readQuiz(node).errors;
  if (name === "scene") {
    const sc = readScene(node);
    if (sc.errors.length || sc.code === undefined) return sc.errors;
    if (!narrationIsLiteral(sc.code)) {
      return ["scene 里 say() 的括号里要直接写一句话（一个字符串），不要用变量或者拼接：讲稿不出现在文章和公开的接口里，程序要能把它整句摘掉。"];
    }
    // 代码的运行结果：保存前已经在沙箱里跑过（见 scene/run.ts 的 runScenes），这里只取结果。
    const result = sceneCache.get(sceneKey(sc.code, sc.ratio));
    return result && !result.ok ? [`场景代码出错，${result.error}`] : [];
  }
  if (name === "trace") {
    const t = readTrace(node);
    if (t.errors.length || t.code === undefined) return t.errors;
    // 代码的运行结果：保存前已经在沙箱里跑过（见 algo/trace.ts 的 runTraces），这里只取结果。
    const errors: string[] = [];
    for (const v of variantsOf(t.input, t.presets)) {
      const result = traceCache.get(traceKey(t.code, v.input));
      if (result && !result.ok) errors.push(`演示代码出错${v.name ? `（「${v.name}」这组输入）` : ""}，${result.error}`);
    }
    return errors;
  }
  return [];
}
