import { visit } from "unist-util-visit";
import { parseToTree } from "../markup/parse";
import { readScene } from "../markup/structure";
import { runScene } from "./execute";
import { rememberScene, sceneCache, sceneKey } from "./shared";
import type { SceneRatio, SceneResult } from "./types";

/**
 * 找出正文里的场景代码，都运行一遍。只在服务端用：要解析正文。
 * 运行本身在 execute.ts 里（浏览器里读者调参数时也用它）。
 */

export { runScene } from "./execute";

/** 正文里所有的场景代码。 */
export function scenesIn(body: string): { key: string; code: string; ratio: SceneRatio }[] {
  const out: { key: string; code: string; ratio: SceneRatio }[] = [];
  visit(parseToTree(body), (node) => {
    if (node.type !== "containerDirective" || (node as { name?: string }).name !== "scene") return;
    const s = readScene(node as never);
    if (s.code === undefined) return;
    out.push({ key: sceneKey(s.code, s.ratio), code: s.code, ratio: s.ratio });
  });
  return out;
}

/**
 * 把正文里的场景代码都运行一遍，结果放进缓存，并按指纹返回。
 * 保存和显示正文之前调用：之后的检查（保存时报出代码的错误）和渲染都从缓存里取。
 */
export async function runScenes(body: string): Promise<Record<string, SceneResult>> {
  const out: Record<string, SceneResult> = {};
  for (const s of scenesIn(body)) {
    let result = sceneCache.get(s.key);
    if (!result) {
      result = await runScene(s.code, s.ratio);
      rememberScene(s.key, result);
    }
    out[s.key] = result;
  }
  return out;
}
