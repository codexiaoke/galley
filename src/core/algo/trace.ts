import variant from "@jitl/quickjs-singlefile-cjs-release-sync";
import { newQuickJSWASMModuleFromVariant, type QuickJSContext, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { parseToTree } from "../markup/parse";
import { readTrace } from "../markup/structure";
import { visit } from "unist-util-visit";
import { DEFAULT_TONE_LABELS, rememberTrace, traceCache, traceKey, type TraceResult } from "./trace-shared";
import { TRACE_PRELUDE } from "./trace-prelude";
import { variantsOf } from "./presets";
import type { Frame, Tone } from "./types";

/**
 * 运行文章里的演示代码（:::trace）。
 *
 * 代码跑在 QuickJS 里：一个用 WebAssembly 编译的、独立的 JavaScript 解释器。
 * 它没有网络、文件、进程这些能力，也碰不到站点的数据库和内存；运行时间和内存都有上限，
 * 死循环会被打断。每次运行都新建一个环境，用完就销毁，不同的代码之间互不影响。
 *
 * 只在服务端运行。读者的浏览器拿到的只是运行结果（每一帧的画面），不会执行作者的代码。
 */

const TIME_LIMIT_MS = 2000;
const MEMORY_LIMIT = 48 * 1024 * 1024;
const STACK_LIMIT = 1024 * 1024;

let quickjs: Promise<QuickJSWASMModule> | undefined;
const loadQuickJS = () => (quickjs ??= newQuickJSWASMModuleFromVariant(variant as never));

/** input 参数：逗号分隔的数字变成数组；能按 JSON 解析的按 JSON；其余原样作为字符串。 */
export function parseTraceInput(input: string | undefined): unknown {
  if (input === undefined || input.trim() === "") return null;
  const text = input.trim();
  if (/^-?\d+(\.\d+)?(\s*[,，]\s*-?\d+(\.\d+)?)*$/.test(text)) return text.split(/\s*[,，]\s*/).map(Number);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type Dumped = { name?: string; message?: string; stack?: string } | string | undefined;

function describeError(e: Dumped): { error: string; line?: number } {
  const obj = typeof e === "object" && e ? e : { message: String(e) };
  const m = /algo\.js:(\d+)/.exec(obj.stack ?? "");
  const line = m ? Number(m[1]) - 1 : undefined;
  let message = obj.message ?? String(e);
  if (message === "interrupted") message = `代码运行超过 ${TIME_LIMIT_MS / 1000} 秒还没结束，可能有死循环。`;
  else if (/out of memory/i.test(message)) message = "代码用的内存太多了。换一个小一点的输入。";
  else if (obj.name && obj.name !== "Error") message = `${obj.name}: ${message}`;
  return { error: line !== undefined ? `第 ${line + 1} 行：${message}` : message, line };
}

function evaluate(vm: QuickJSContext, code: string, filename: string): { ok: true; value: unknown } | { ok: false; error: Dumped } {
  const r = vm.evalCode(code, filename);
  if (r.error) {
    const error = vm.dump(r.error) as Dumped;
    r.error.dispose();
    return { ok: false, error };
  }
  const value = vm.dump(r.value);
  r.value.dispose();
  return { ok: true, value };
}

export async function runTrace(code: string, input?: string): Promise<TraceResult> {
  const QuickJS = await loadQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(STACK_LIMIT);
  const deadline = Date.now() + TIME_LIMIT_MS;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    const prelude = evaluate(vm, TRACE_PRELUDE, "prelude.js");
    if (!prelude.ok) return { ok: false, error: `演示环境出错：${describeError(prelude.error).error}` };
    const given = evaluate(vm, `globalThis.input = ${JSON.stringify(parseTraceInput(input))};`, "input.js");
    if (!given.ok) return { ok: false, error: "input 参数解析失败。" };
    const ran = evaluate(vm, code, "algo.js");
    if (!ran.ok) return { ok: false, ...describeError(ran.error) };
    const done = evaluate(vm, "__finish()", "finish.js");
    if (!done.ok) return { ok: false, ...describeError(done.error) };
    const { frames, legend } = JSON.parse(String(done.value)) as { frames: Frame[]; legend: Partial<Record<Tone, string>> };
    return { ok: true, frames, legend: legendFor(frames, legend) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

/** 图例：只列出这段演示里真正出现过的状态。 */
function legendFor(frames: Frame[], custom: Partial<Record<Tone, string>>) {
  const used = new Set<Tone>();
  const GRID: Record<string, Tone> = { v: "visited", f: "frontier", c: "active", p: "path" };
  const add = (t: Tone | null | undefined) => t && used.add(t);
  for (const frame of frames) {
    for (const view of [frame.view, ...(frame.extra ?? [])]) {
      if (view.kind === "array" || view.kind === "heap") view.tones.forEach(add);
      if (view.kind === "table") Object.values(view.tones).forEach(add);
      if (view.kind === "grid") for (const ch of view.cells) add(GRID[ch]);
      if (view.kind === "graph") {
        view.nodes.forEach((n) => add(n.tone));
        view.edges.forEach((e) => add(e.tone));
      }
      if (view.kind === "tree") view.nodes.forEach((n) => add(n.tone));
    }
  }
  const order = Object.keys(DEFAULT_TONE_LABELS) as Tone[];
  return order.filter((t) => used.has(t)).map((tone) => ({ tone, label: custom[tone] ?? DEFAULT_TONE_LABELS[tone] }));
}

/** 正文里所有演示代码。 */
export function tracesIn(body: string): { key: string; code: string; input?: string }[] {
  const out: { key: string; code: string; input?: string }[] = [];
  visit(parseToTree(body), (node) => {
    if (node.type !== "containerDirective" || (node as { name?: string }).name !== "trace") return;
    const t = readTrace(node as never);
    if (t.code === undefined) return;
    for (const v of variantsOf(t.input, t.presets)) out.push({ key: traceKey(t.code, v.input), code: t.code, input: v.input });
  });
  return out;
}

/**
 * 把正文里的演示代码都运行一遍，结果放进缓存，并按指纹返回。
 * 保存和显示正文之前调用：之后的检查（保存时报出代码的错误）和渲染都从缓存里取。
 */
export async function runTraces(body: string): Promise<Record<string, TraceResult>> {
  const out: Record<string, TraceResult> = {};
  for (const t of tracesIn(body)) {
    let result = traceCache.get(t.key);
    if (!result) {
      result = await runTrace(t.code, t.input);
      rememberTrace(t.key, result);
    }
    out[t.key] = result;
  }
  return out;
}
