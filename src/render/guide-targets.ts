import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";
import { sceneFrame, sceneTargetVisible } from "../core/scene/frame";
import type { Scene } from "../core/scene/types";
import type { GuideTarget } from "../contract/narration";

/** FNV-1a：前台和服务端都能算，不依赖 node:crypto。 */
export function fingerprint(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(36).padStart(7, "0");
}

/**
 * 页面正文的语义锚点和目录从同一 AST 产生；不把讲稿、组件内部说明当正文。
 *
 * 编号取这段源文的指纹，不用它在页里的位置：改了别的段落，这一段的指向仍然有效；
 * 只有这一段自己改了，指向才失效。同一页里内容相同的段落按出现顺序加序号。
 * 用源文而不是渲染后的文字：演示页的处理会给标题加锚点、替换引用，两边的文字不一样。
 */
export function proseGuideTargets(tree: Root, page: number, source: string): { node: RootContent; target: GuideTarget }[] {
  const seen = new Map<string, number>();
  return tree.children.flatMap((child) => child.type === "list" ? child.children : [child]).flatMap((node) => {
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if (!["heading", "paragraph", "listItem"].includes(node.type) || start === undefined || end === undefined) return [];
    if (node.type === "paragraph" && node.children.some((child) => child.type === "image")) return [];
    const label = toString(node).trim().slice(0, 100);
    if (!label) return [];
    const hash = fingerprint(source.slice(start, end).replace(/\s+/g, " ").trim());
    const count = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, count);
    return [{ node, target: { id: `p${page}:text-${hash}${count > 1 ? `-${count}` : ""}`, label } }];
  });
}

const SAMPLE_MS = 50;

export function sceneGuideTargets(scene: Scene, key: string, step: number): GuideTarget[] {
  const duration = step < 0 ? 0 : scene.steps[step].duration;
  const marks = step < 0 ? [] : scene.steps[step].tweens.flatMap((tween) => [tween.at + tween.dur / 2, tween.at + tween.dur]);
  const times = [...new Set([0, ...Array.from({ length: Math.floor(duration / SAMPLE_MS) }, (_, i) => (i + 1) * SAMPLE_MS), ...marks, duration])].sort((a, b) => a - b);
  const frames = times.map((t) => ({ t, frame: sceneFrame(scene, step, t) }));
  const final = frames.at(-1)!.frame;
  const kinds: Record<string, string> = { box: "方块", frame: "边界框", circle: "圆点", text: "文字", code: "代码", link: "连线", image: "图片", path: "曲线" };
  return scene.nodes.flatMap((node) => {
    if (node.kind === "camera" || node.kind === "packet") return [];
    const appears = frames.find(({ frame }) => sceneTargetVisible(frame[node.id]));
    if (!appears) return [];
    const props = final[node.id];
    const text = [props.text, props.label, props.sub].filter((v) => typeof v === "string" && v).join(" · ");
    const target: GuideTarget = { id: `${key}:${node.id}`, label: `${kinds[node.kind]} · ${text || node.tip || node.id}`.slice(0, 200) };
    // 这一拍开始后多久才画出来；讲稿提到它的时机早于这个时间，画面上就指不到。
    if (appears.t > 0) target.appearsMs = Math.round(appears.t);
    return [target];
  });
}
