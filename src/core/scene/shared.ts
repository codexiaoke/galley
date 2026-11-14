import { SCENE_PRELUDE } from "./prelude";
import type { Scene, SceneResult } from "./types";

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

/**
 * 讲稿（每一步的 say）和写给读者的文字是两回事：讲稿是作者讲的时候自己说的话，
 * 和 :::notes 一样只在演示里用，不出现在文章页面和公开的接口里。下面三个函数管这件事。
 */

/** 去掉讲稿的场景：文章页面上用这一份，讲稿不会被送到读者的浏览器里 */
export function withoutNarration(scene: Scene): Scene {
  if (!scene.steps.some((s) => s.say !== undefined)) return scene;
  return { ...scene, steps: scene.steps.map((step) => ({ text: step.text, tweens: step.tweens, duration: step.duration })) };
}

/** 一个字符串：双引号、单引号或反引号 */
const STRING_LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/.source;
const SAY_CALL = String.raw`\bsay\s*\(\s*(?:${STRING_LITERAL})\s*\)[ \t]*;?`;

/**
 * say() 的括号里是不是都直接写着一句话。
 * 讲稿要能从代码里整句摘掉（下面的 stripNarration），用变量或拼接出来的摘不干净，所以保存时就不让这样写。
 */
export function narrationIsLiteral(code: string): boolean {
  const calls = code.match(/\bsay\s*\(/g)?.length ?? 0;
  return calls === (code.match(new RegExp(SAY_CALL, "g"))?.length ?? 0);
}

/** 从场景代码里摘掉讲稿：公开的幻灯片接口给出的是这一份 */
export function stripNarration(code: string): string {
  return code
    .replace(new RegExp(String.raw`^[ \t]*` + SAY_CALL + String.raw`[ \t]*\r?\n`, "gm"), "")
    .replace(new RegExp(SAY_CALL, "g"), "");
}

/** 代码块的语言：只运行 JavaScript。 */
export const SCENE_LANGS = ["js", "javascript"];
