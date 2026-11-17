import { parseToTree } from "@/core/markup/parse";
import { readScene3D } from "@/core/markup/structure";
import { scene3dKey } from "@/core/scene3d/shared";
import type { Scene3DResult } from "@/core/scene3d/schema";
import { splitSlides } from "./slides";
export function readImmersiveScene3D(body: string, scenes: Record<string, Scene3DResult>) {
  const slides = splitSlides(body);
  if (slides.length !== 1) return null;
  const nodes = parseToTree(slides[0].source).children.filter((node) => node.type !== "heading");
  const node = nodes[0] as {type:string;name?:string} | undefined;
  if (nodes.length !== 1 || node?.type !== "containerDirective" || node.name !== "scene3d") return null;
  const source = readScene3D(node), id = scene3dKey(source.code ?? ""), result = scenes[id];
  return result?.ok ? {id, title: source.title, scene: result.scene} : null;
}
