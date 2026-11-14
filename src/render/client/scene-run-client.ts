import type { RunSceneOptions } from "@/core/scene/execute";
import type { SceneRatio, SceneResult } from "@/core/scene/types";

/**
 * 页面这一侧：把场景代码和读者调好的数值交给后台线程（scene-worker.ts）重新跑，等结果。
 *
 * 后台线程在读者第一次动手时才创建，之后页面上所有的场景共用一个。
 * 沙箱自己会打断跑太久的代码；万一后台线程本身卡住了，3 秒没有回音就结束整个线程，下次再新建。
 *
 * 注意不要在这里引入 execute.ts 的实际代码（只引类型），否则 QuickJS 会被打包进页面里。
 */

const HARD_LIMIT_MS = 3000;

type Pending = { resolve: (result: SceneResult) => void; timer: ReturnType<typeof setTimeout> };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function kill(error: string) {
  worker?.terminate();
  worker = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error });
    pending.delete(id);
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./scene-worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ id: number; result: SceneResult }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(e.data.id);
    p.resolve(e.data.result);
  };
  w.onerror = (e) => {
    e.preventDefault();
    kill("运行环境没有加载成功。");
  };
  worker = w;
  return w;
}

/** 带着读者调好的数值，把场景代码重新跑一遍 */
export function rerunScene(code: string, ratio: SceneRatio, options: RunSceneOptions): Promise<SceneResult> {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, { resolve, timer: setTimeout(() => kill("重新运行超时了。"), HARD_LIMIT_MS) });
    try {
      getWorker().postMessage({ id, code, ratio, options });
    } catch (e) {
      clearTimeout(pending.get(id)?.timer);
      pending.delete(id);
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
