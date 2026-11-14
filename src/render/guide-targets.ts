import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";
import { sceneFrame, sceneTargetVisible } from "../core/scene/frame";
import type { Scene } from "../core/scene/types";
import type { GuideTarget } from "../core/studio-types";

/** 页面正文的语义锚点和目录从同一 AST 产生；不把讲稿、组件内部说明当正文。 */
export function proseGuideTargets(tree: Root, page: number): { node: RootContent; target: GuideTarget }[] {
  return tree.children.flatMap((child) => child.type === "list" ? child.children : [child]).flatMap((node) => {
    if (!["heading", "paragraph", "listItem"].includes(node.type) || node.position?.start.offset === undefined) return [];
    if (node.type === "paragraph" && node.children.some((child) => child.type === "image")) return [];
    const label = toString(node).trim().slice(0, 100);
    return label ? [{ node, target: { id: `p${page}:text-${node.position.start.offset}`, label } }] : [];
  });
}

export function sceneGuideTargets(scene: Scene, key: string, step: number): GuideTarget[] {
  const times = step < 0 ? [0] : [0, ...scene.steps[step].tweens.flatMap((tween) => [tween.at + tween.dur / 2, tween.at + tween.dur]), scene.steps[step].duration];
  const frames = times.map((t) => sceneFrame(scene, step, t));
  const final = frames.at(-1)!;
  const kinds: Record<string, string> = { box: "方块", frame: "边界框", circle: "圆点", text: "文字", code: "代码", link: "连线", image: "图片", path: "曲线" };
  return scene.nodes.filter((node) => node.kind !== "camera" && node.kind !== "packet" && frames.some((frame) => sceneTargetVisible(frame[node.id]))).map((node) => {
    const props = final[node.id];
    const text = [props.text, props.label, props.sub].filter((v) => typeof v === "string" && v).join(" · ");
    return { id: `${key}:${node.id}`, label: `${kinds[node.kind]} · ${text || node.tip || node.id}`.slice(0, 200) };
  });
}
