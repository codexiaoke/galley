import { SCENE_PRELUDE } from "./prelude";
import type { SceneResult } from "./types";

/**
 * 场景动画里，浏览器和服务端都要用到的部分：运行结果的缓存和它的指纹。
 * 这里不能引入沙箱本身（QuickJS 有好几 MB），沙箱在 run.ts 里，只在服务端运行。
 */

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

/** 沙箱里那套函数（prelude.ts）的指纹：函数改了，所有场景自动重新运行 */
const ENGINE = hash(SCENE_PRELUDE);

export function sceneKey(code: string, ratio = "16:9"): string {
  return hash(`scene\u0000${ENGINE}\u0000${ratio}\u0000${code}`);
}

/**
 * 运行结果的缓存。沙箱运行是异步的，正文的检查和渲染是同步的：保存和显示之前先把场景代码都跑一遍
 * （run.ts 的 runScenes），结果放在这里，检查和渲染时直接取。挂在 globalThis 上，开发时热更新不会丢。
 */
const store = globalThis as unknown as { __galleyScenes?: Map<string, SceneResult> };
export const sceneCache: Map<string, SceneResult> = (store.__galleyScenes ??= new Map());

const SCENE_CACHE_LIMIT = 200;

export function rememberScene(key: string, result: SceneResult) {
  sceneCache.delete(key);
  sceneCache.set(key, result);
  while (sceneCache.size > SCENE_CACHE_LIMIT) sceneCache.delete(sceneCache.keys().next().value!);
}

/** 代码块的语言：只运行 JavaScript。 */
export const SCENE_LANGS = ["js", "javascript"];
