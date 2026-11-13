import { TRACE_PRELUDE } from "./trace-prelude";
import type { Frame, Tone } from "./types";

/**
 * 代码驱动的动画（:::trace）里，浏览器和服务端都要用到的部分。
 * 这里不能引入沙箱本身（QuickJS 有好几 MB），沙箱在 trace.ts 里，只在服务端运行。
 */

export type TraceResult =
  | { ok: true; frames: Frame[]; legend: { tone: Tone; label: string }[] }
  | { ok: false; error: string; line?: number };

function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** 沙箱里那套函数（trace-prelude.ts）的指纹：函数改了，所有演示自动重新运行，不会用到旧的结果 */
const ENGINE = hash(TRACE_PRELUDE);

/** 代码、输入和沙箱函数一起的指纹，用来缓存运行结果。不需要防碰撞攻击，够区分就行。 */
export function traceKey(code: string, input = ""): string {
  return hash(`${ENGINE}\u0000${code}\u0000${input}`);
}

/**
 * 运行结果的缓存。沙箱运行是异步的，而正文的检查和渲染是同步的：
 * 保存和显示之前先把正文里的代码都跑一遍（见 trace.ts 的 runTraces），结果放在这里，
 * 检查和渲染时直接取。挂在 globalThis 上，开发时热更新不会丢。
 */
const store = globalThis as unknown as { __galleyTraces?: Map<string, TraceResult> };
export const traceCache: Map<string, TraceResult> = (store.__galleyTraces ??= new Map());

export const TRACE_CACHE_LIMIT = 300;

export function rememberTrace(key: string, result: TraceResult) {
  traceCache.delete(key);
  traceCache.set(key, result);
  while (traceCache.size > TRACE_CACHE_LIMIT) traceCache.delete(traceCache.keys().next().value!);
}

/** 图例里每种状态的默认说法，作者可以用 legend({...}) 改。 */
export const DEFAULT_TONE_LABELS: Record<Tone, string> = {
  compare: "比较",
  swap: "交换",
  active: "当前",
  pivot: "标记",
  sorted: "已确定",
  found: "找到",
  dim: "排除",
  visited: "已访问",
  frontier: "待访问",
  path: "路径",
};

/** 代码块的语言：只运行 JavaScript。 */
export const TRACE_LANGS = ["js", "javascript"];
