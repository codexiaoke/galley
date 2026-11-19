import { parseToTree } from "@/core/markup/parse";
import { readScene3D } from "@/core/markup/structure";
import { scene3dKey } from "@/core/scene3d/shared";
import type { Scene3DResult } from "@/core/scene3d/schema";
import { splitSlides } from "./slides";
export function readImmersiveScene3D(body: string, scenes: Record<string, Scene3DResult>) {
  const slides = splitSlides(body);
  if (slides.length !== 1) return null;
  return readScene3DSlide(slides[0].source, scenes);
}

/** 单页与整篇共用识别规则；混合演示里的三维页也占满舞台。 */
export function readScene3DSlide(source: string, scenes: Record<string, Scene3DResult>) {
  const nodes = parseToTree(source).children.filter((node) => node.type !== "heading");
  const node = nodes[0] as {type:string;name?:string} | undefined;
  if (nodes.length !== 1 || node?.type !== "containerDirective" || node.name !== "scene3d") return null;
  const script = readScene3D(node), id = scene3dKey(script.code ?? ""), result = scenes[id];
  return result?.ok ? {id, title: script.title, scene: result.scene} : null;
}
