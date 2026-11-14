/**
 * 读者调参数、拖动画面上的点时，在后台线程里把场景代码重新跑一遍。
 *
 * 跑的是和服务端同一份代码（core/scene/execute.ts）：作者的代码在 QuickJS 里，没有网络、没有页面，
 * 时间和内存有上限；这个线程本身也碰不到页面。页面发来 { id, code, ratio, options }，
 * 这里回 { id, result }。QuickJS 只在读者第一次动手时才下载。
 */
import { runScene, type RunSceneOptions } from "@/core/scene/execute";
import type { SceneRatio } from "@/core/scene/types";

type Request = { id: number; code: string; ratio: SceneRatio; options: RunSceneOptions };

/** 读者拖动时每次重新运行最多给这么久：正常的场景几毫秒就跑完，超过说明代码有问题 */
const DRAG_TIME_LIMIT_MS = 500;

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, code, ratio, options } = e.data;
  const result = await runScene(code, ratio, { ...options, timeLimit: DRAG_TIME_LIMIT_MS });
  self.postMessage({ id, result });
};
