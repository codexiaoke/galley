/**
 * 运行代码的后台线程（Web Worker）。QuickJS 的下载、编译和运行都在这里，页面本身始终不卡。
 * 页面发来 { id, code }，这里先回一个 { id, started: true }（开始计时），跑完回 { id, output }。
 * 万一卡死，页面会直接结束整个线程（见 code-runner.tsx 的 runInWorker）。
 */
import { prepareSandbox, runJavaScript } from "./run-sandbox";

type Request = { id: number; code: string };

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, code } = e.data;
  await prepareSandbox();
  self.postMessage({ id, started: true });
  const output = await runJavaScript(code);
  self.postMessage({ id, output });
};
