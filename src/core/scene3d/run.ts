import { visit } from "unist-util-visit";
import { parseToTree } from "../markup/parse";
import { readScene3D } from "../markup/structure";
import { runScene3D } from "./execute";
import { rememberScene3D, scene3dCache, scene3dKey } from "./shared";
import type { Scene3DResult } from "./schema";
export async function runScenes3D(body: string): Promise<Record<string, Scene3DResult>> {
  const scripts: string[] = [];
  visit(parseToTree(body), (node) => {
    if (node.type !== "containerDirective" || (node as { name?: string }).name !== "scene3d") return;
    const source = readScene3D(node as never);
    if (!source.errors.length && source.code !== undefined) scripts.push(source.code);
  });
  const out: Record<string, Scene3DResult> = {};
  for (const code of scripts) {
    const key = scene3dKey(code), result = scene3dCache.get(key) ?? await runScene3D(code);
    rememberScene3D(key, result); out[key] = result;
  }
  return out;
}
