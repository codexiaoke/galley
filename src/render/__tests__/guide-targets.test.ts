import { expect, it } from "vitest";
import { sceneGuideTargets } from "../guide-targets";
import type { Scene } from "../../core/scene/types";

it("指向目录包含本拍将出现的节点，排除未画出的线、隐藏控件与镜头", () => {
  const scene: Scene = { w: 800, h: 450, nodes: [
    { id: "box", kind: "box", props: { text: "页面", opacity: 0 } },
    { id: "curve", kind: "path", props: { opacity: 1, draw: 0 } },
    { id: "camera", kind: "camera", props: { opacity: 1 } },
    { id: "hidden", kind: "text", props: { text: "下一步才出现", opacity: 0 } },
  ], steps: [{ text: "展示页面", duration: 1000, tweens: [
    { id: "box", prop: "opacity", from: 0, to: 1, at: 0, dur: 200, ease: "linear" },
    { id: "curve", prop: "draw", from: 0, to: 1, at: 200, dur: 500, ease: "linear" },
  ] }], params: [{ kind: "slider", name: "a", label: "隐藏的滑块", min: 0, max: 1, step: 0.1, value: 0.5, initial: 0.5 }] };
  expect(sceneGuideTargets(scene, "s", -1)).toEqual([]);
  expect(sceneGuideTargets(scene, "s", 0).map((target) => target.id)).toEqual(["s:box", "s:curve"]);
});
