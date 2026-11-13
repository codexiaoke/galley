import type { RunOutput } from "./run-sandbox";

/**
 * 页面这一侧：把代码交给后台线程（run-worker.ts）去跑，等结果。
 *
 * 后台线程第一次点「运行」时才创建，之后所有代码块共用一个。
 * 沙箱自己会在 2 秒时打断代码；万一后台线程本身卡住了，开始运行 4 秒后还没回音，就直接结束整个线程，
 * 下次运行再新建一个。读者点「停止」也是结束整个线程。
 *
 * 注意不要在这里引入 run-sandbox 的实际代码（只引类型），否则 QuickJS 会被打包进页面里。
 */

const HARD_LIMIT_MS = 4000;

type Pending = { resolve: (output: RunOutput) => void; timer?: ReturnType<typeof setTimeout> };
type Reply = { id: number; started?: boolean; output?: RunOutput };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

const failed = (error: string): RunOutput => ({ lines: [], error, ms: 0, truncated: false });

/** 结束后台线程，还没跑完的都按 error 收尾。 */
function kill(error: string) {
  worker?.terminate();
  worker = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve(failed(error));
    pending.delete(id);
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./run-worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<Reply>) => {
    const { id, started, output } = e.data;
    const p = pending.get(id);
    if (!p) return;
    if (started) {
      p.timer = setTimeout(() => kill(`运行超过 ${HARD_LIMIT_MS / 1000} 秒没有结束，已经停下了。`), HARD_LIMIT_MS);
    } else if (output) {
      clearTimeout(p.timer);
      pending.delete(id);
      p.resolve(output);
    }
  };
  w.onerror = (e) => {
    e.preventDefault();
    kill(`运行环境没有加载成功${e.message ? `：${e.message}` : ""}。刷新页面再试一次。`);
  };
  worker = w;
  return w;
}

/** 在后台线程里运行一段代码。 */
export function runInWorker(code: string): Promise<RunOutput> {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, { resolve });
    try {
      getWorker().postMessage({ id, code });
    } catch (e) {
      pending.delete(id);
      resolve(failed(`浏览器不支持后台运行：${e instanceof Error ? e.message : String(e)}`));
    }
  });
}

/** 读者点「停止」：结束正在跑的代码。 */
export function stopRunning() {
  if (pending.size > 0) kill("已经停下了。");
}
