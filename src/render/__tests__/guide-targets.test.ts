import { expect, it } from "vitest";
import { proseGuideTargets, sceneGuideTargets } from "../guide-targets";
import { parseToTree } from "../../core/markup/parse";
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

it("场景元素记下这一拍开始后多久才画出来，一开始就在的不写", () => {
  const scene: Scene = { w: 800, h: 450, nodes: [
    { id: "ready", kind: "box", props: { text: "一直在", opacity: 1 } },
    { id: "late", kind: "box", props: { text: "后出现", opacity: 0 } },
  ], steps: [{ text: "", duration: 2000, tweens: [{ id: "late", prop: "opacity", from: 0, to: 1, at: 1000, dur: 400, ease: "linear" }] }], params: [] };
  const [ready, late] = sceneGuideTargets(scene, "s", 0);
  expect(ready.appearsMs).toBeUndefined();
  expect(late.appearsMs).toBeGreaterThanOrEqual(1050);
  expect(late.appearsMs).toBeLessThanOrEqual(1150);
});

it("正文目标按段落内容编号：改别的段落不影响，改这一段才失效，相同段落加序号", () => {
  const ids = (source: string) => proseGuideTargets(parseToTree(source), 3, source).map(({ target }) => target.id);
  const before = ids("## 三道墙\n\n第一段。\n\n第二段。\n\n- 条目\n- 条目");
  const otherEdited = ids("## 三道墙\n\n第一段改得更长了一些。\n\n第二段。\n\n- 条目\n- 条目");
  expect(before).toHaveLength(5);
  expect(before[2]).toBe(otherEdited[2]);
  expect(before[0]).toBe(otherEdited[0]);
  expect(before[1]).not.toBe(otherEdited[1]);
  expect(before[4]).toBe(`${before[3]}-2`);
  expect(before.every((id) => id.startsWith("p3:text-"))).toBe(true);
});
