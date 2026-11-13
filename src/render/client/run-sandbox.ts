import variant from "@jitl/quickjs-singlefile-cjs-release-sync";
import { newQuickJSWASMModuleFromVariant, type QuickJSContext, type QuickJSWASMModule } from "quickjs-emscripten-core";

/**
 * 在读者的浏览器里运行文章里的一段 JavaScript（代码块写成 ```js run）。
 *
 * 不在页面本身里运行（那样代码能读到页面、发请求、带上读者的登录状态），
 * 而是在 QuickJS 里运行：一个用 WebAssembly 编译的独立解释器，和服务端运行演示代码用的是同一个。
 * 它没有网络、没有页面、没有存储，只有我们给它的 console 和定时器；时间和内存都有上限，死循环会被打断。
 * 它跑在后台线程里（run-worker.ts），页面本身不会被卡住。这个文件只在读者点「运行」时才下载。
 *
 * 定时器是模拟的：不真的等待，按时间顺序依次执行，所以 setTimeout(fn, 1000) 也会马上出结果。
 */

const TIME_LIMIT_MS = 2000;
const MEMORY_LIMIT = 32 * 1024 * 1024;
const STACK_LIMIT = 512 * 1024;
const MAX_LINES = 200;
const MAX_CHARS = 20000;

export type OutputLine = { level: "log" | "info" | "warn" | "error" | "result"; text: string };
export type RunOutput = { lines: OutputLine[]; error?: string; ms: number; truncated: boolean };

let quickjs: Promise<QuickJSWASMModule> | undefined;
const load = () => (quickjs ??= newQuickJSWASMModuleFromVariant(variant as never));

/** 先把 QuickJS 准备好（下载、编译）。运行的计时从准备好之后才开始。 */
export const prepareSandbox = async () => void (await load());

/** 运行的时间上限（毫秒）。页面在这之后再等一会儿，还没结果就直接结束后台线程 */
export const RUN_TIME_LIMIT_MS = TIME_LIMIT_MS;

/** 沙箱里的 console 和定时器。值的显示方式尽量接近 Node.js 和浏览器的控制台。 */
const PRELUDE = String.raw`
(() => {
  const fmt = (v, depth, seen) => {
    if (typeof v === "string") return depth ? JSON.stringify(v) : v;
    if (typeof v === "bigint") return v + "n";
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "function") return "[Function " + (v.name || "(anonymous)") + "]";
    if (v === null || typeof v !== "object") return String(v);
    if (seen.has(v)) return "[Circular]";
    if (v instanceof Error) return v.name + ": " + v.message;
    if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (depth > 3) return Array.isArray(v) ? "[Array]" : "[Object]";
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        const items = v.slice(0, 100).map((x) => fmt(x, depth + 1, seen));
        if (v.length > 100) items.push("... " + (v.length - 100) + " more items");
        return "[ " + items.join(", ") + (items.length ? " ]" : "]");
      }
      if (v instanceof Map) return "Map(" + v.size + ") { " + [...v].slice(0, 50).map(([k, x]) => fmt(k, depth + 1, seen) + " => " + fmt(x, depth + 1, seen)).join(", ") + " }";
      if (v instanceof Set) return "Set(" + v.size + ") { " + [...v].slice(0, 50).map((x) => fmt(x, depth + 1, seen)).join(", ") + " }";
      const name = v.constructor && v.constructor !== Object ? v.constructor.name + " " : "";
      const entries = Object.entries(v).slice(0, 50).map(([k, x]) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ": " + fmt(x, depth + 1, seen));
      return name + (entries.length ? "{ " + entries.join(", ") + " }" : "{}");
    } finally {
      seen.delete(v);
    }
  };
  globalThis.__fmt = (v) => fmt(v, 0, new Set());
  const out = (level) => (...args) => __print(level, args.map((a) => (typeof a === "string" ? a : fmt(a, 0, new Set()))).join(" "));
  globalThis.console = { log: out("log"), debug: out("log"), info: out("info"), warn: out("warn"), error: out("error"), table: (d) => __print("log", fmt(d, 0, new Set())) };

  const timers = [];
  let seq = 0;
  let now = 0;
  const add = (fn, ms, args, every) => {
    const id = ++seq;
    timers.push({ id, at: now + Math.max(0, Number(ms) || 0), fn, args, every });
    return id;
  };
  globalThis.setTimeout = (fn, ms, ...args) => add(fn, ms, args, 0);
  globalThis.setInterval = (fn, ms, ...args) => add(fn, ms, args, Math.max(1, Number(ms) || 0));
  globalThis.clearTimeout = globalThis.clearInterval = (id) => {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  };
  globalThis.__nextTimer = () => {
    if (!timers.length) return false;
    timers.sort((a, b) => a.at - b.at || a.id - b.id);
    const t = timers.shift();
    now = t.at;
    if (t.every) timers.push({ ...t, at: now + t.every });
    t.fn(...t.args);
    return true;
  };
})();
`;

type Dumped = { name?: string; message?: string; stack?: string } | string | undefined;

function describe(e: Dumped): string {
  const obj = typeof e === "object" && e ? e : { message: String(e) };
  let message = obj.message ?? String(e);
  if (message === "interrupted") return `运行超过 ${TIME_LIMIT_MS / 1000} 秒还没结束，可能有死循环，已经停下了。`;
  if (/out of memory/i.test(message)) return "用的内存太多了，已经停下了。";
  if (obj.name && obj.name !== "Error") message = `${obj.name}: ${message}`;
  const line = /run\.js:(\d+)/.exec(obj.stack ?? "");
  return line ? `第 ${line[1]} 行：${message}` : message;
}

export async function runJavaScript(code: string): Promise<RunOutput> {
  const QuickJS = await load();
  const started = performance.now();
  const lines: OutputLine[] = [];
  let chars = 0;
  let truncated = false;
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(STACK_LIMIT);
  const deadline = Date.now() + TIME_LIMIT_MS;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm: QuickJSContext = runtime.newContext();
  const result = (error?: string): RunOutput => ({ lines, error, ms: Math.round(performance.now() - started), truncated });

  const print = vm.newFunction("__print", (level, text) => {
    if (truncated) return;
    const value = vm.getString(text);
    chars += value.length;
    if (lines.length >= MAX_LINES || chars > MAX_CHARS) {
      truncated = true;
      return;
    }
    lines.push({ level: vm.getString(level) as OutputLine["level"], text: value });
  });
  vm.setProp(vm.global, "__print", print);
  print.dispose();

  const evaluate = (source: string, filename: string) => {
    const r = vm.evalCode(source, filename);
    if (r.error) {
      const error = vm.dump(r.error) as Dumped;
      r.error.dispose();
      return { ok: false as const, error };
    }
    return { ok: true as const, handle: r.value };
  };
  /** 跑完排着的 Promise 回调。出错时返回错误信息。 */
  const drain = (): string | undefined => {
    const jobs = runtime.executePendingJobs();
    if (jobs.error) {
      const error = vm.dump(jobs.error) as Dumped;
      jobs.error.dispose();
      return describe(error);
    }
    return undefined;
  };

  try {
    const prelude = evaluate(PRELUDE, "prelude.js");
    if (!prelude.ok) return result(`运行环境出错：${describe(prelude.error)}`);
    prelude.handle.dispose();

    const ran = evaluate(code, "run.js");
    if (!ran.ok) return result(describe(ran.error));
    // 什么都没打印时，显示最后一个表达式的值（像控制台那样）
    vm.setProp(vm.global, "__last", ran.handle);
    ran.handle.dispose();

    let failed = drain();
    while (!failed) {
      const next = evaluate("__nextTimer()", "timer.js");
      if (!next.ok) {
        failed = describe(next.error);
        break;
      }
      const more = vm.dump(next.handle);
      next.handle.dispose();
      failed = drain();
      if (!more) break;
    }
    if (failed) return result(failed);

    if (lines.length === 0) {
      const last = evaluate("__last === undefined ? undefined : __fmt(__last)", "result.js");
      if (last.ok) {
        const text = vm.dump(last.handle);
        last.handle.dispose();
        if (typeof text === "string") lines.push({ level: "result", text });
      }
    }
    return result();
  } catch (e) {
    return result(e instanceof Error ? e.message : String(e));
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
