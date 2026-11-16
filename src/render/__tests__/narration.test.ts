import { describe, expect, it } from "vitest";
import { runScenes } from "@/core/scene/run";
import { sceneKey } from "@/core/scene/shared";
import { narrationBeats, parseTiming } from "../narration";
import { structureFingerprint } from "@/core/presentation-version";

const SCENE = `const a = box("甲")
step("写给读者的第一句。", () => { say("讲的时候说的第一句。"); show(a) })
step("这一步没写讲稿。", () => pulse(a))`;

const BODY = `开场白，没有讲稿。

## 第一节

:::present
这一节的引子。
:::

:::notes
这一页的讲稿，说给人听的。
:::

:::scene{title="示意"}
\`\`\`js
${SCENE}
\`\`\`
:::

## 第二节

:::code-steps
\`\`\`js
let a = 1
\`\`\`
第一步。

\`\`\`js
let a = 2
\`\`\`
第二步。
:::
`;

describe("讲稿清单", () => {
  it("按播放的顺序一拍一拍给出：封面、每一页、场景的每一步、结尾", async () => {
    const beats = narrationBeats(BODY, await runScenes(BODY));
    const key = sceneKey(SCENE);
    expect(beats.map((b) => b.id)).toEqual(["p0", "p1", "p2", "p3", `${key}.0`, `${key}.1`, "p4", "p5"]);
    expect(beats.map((b) => b.kind)).toEqual(["cover", "page", "page", "page", "step", "step", "page", "ending"]);
    // 页的讲稿是这一页的 :::notes；没写的是空的
    expect(beats.find((b) => b.id === "p1")).toMatchObject({ text: "", title: null });
    expect(beats.find((b) => b.id === "p2")).toMatchObject({ text: "这一页的讲稿，说给人听的。", title: "第一节" });
    // 场景独占一页（第 3 页）：这一页本身没有讲稿，只是亮个相就开始走步骤
    expect(beats.find((b) => b.id === "p3")).toMatchObject({ text: "", section: "第一节", suggestedMs: 1200 });
    // 封面和结尾只停一秒
    for (const kind of ["cover", "ending"]) expect(beats.find((b) => b.kind === kind)).toMatchObject({ suggestedMs: 1000, minMs: 1000 });
  });

  it("场景的每一步：讲稿是 say，画面下面那句只作参考；最短要等动画放完", async () => {
    const beats = narrationBeats(BODY, await runScenes(BODY));
    const key = sceneKey(SCENE);
    const [first, second] = beats.filter((b) => b.kind === "step");
    expect(first).toMatchObject({ id: `${key}.0`, page: 3, text: "讲的时候说的第一句。", written: "写给读者的第一句。" });
    expect(second).toMatchObject({ text: "", written: "这一步没写讲稿。" });
    expect(first.minMs).toBeGreaterThan(300);
    expect(first.suggestedMs).toBeGreaterThanOrEqual(first.minMs);
    expect(second.suggestedMs).toBeGreaterThan(second.minMs);
  });

  it("有自己走节奏的播放器的页会标出来", async () => {
    const beats = narrationBeats(BODY, await runScenes(BODY));
    expect(beats.find((b) => b.id === "p4")).toMatchObject({ selfPaced: true, title: "第二节" });
    expect(beats.filter((b) => b.selfPaced).map((b) => b.id)).toEqual(["p4"]);
  });

  it("锚点按内容算：前面插一页、场景代码改了，原来的页、步骤和元素还对得上", async () => {
    const before = narrationBeats(BODY, await runScenes(BODY));
    const inserted = BODY.replace("## 第二节", "## 新加的一节\n\n新加的内容。\n\n## 第二节").replace("const a = box(\"甲\")", "const z = box(\"新\")\nconst a = box(\"甲\")");
    const after = narrationBeats(inserted, await runScenes(inserted));
    const pick = (beats: typeof before, kind: string) => beats.filter((b) => b.kind === kind);
    // 编号变了：页码往后挪，场景代码改了指纹也变了
    expect(pick(after, "step").map((b) => b.id)).not.toEqual(pick(before, "step").map((b) => b.id));
    expect(after.find((b) => b.title === "第二节")!.id).not.toBe(before.find((b) => b.title === "第二节")!.id);
    // 锚点没变
    for (const kind of ["cover", "step", "ending"]) expect(pick(after, kind).map((b) => b.anchor)).toEqual(pick(before, kind).map((b) => b.anchor));
    for (const title of ["第一节", "第二节"]) expect(after.find((b) => b.title === title)!.anchor).toBe(before.find((b) => b.title === title)!.anchor);
    const step = (beats: typeof before) => pick(beats, "step")[0].targets!.find((t) => t.label.includes("甲"))!;
    expect(step(after).anchor).toBe(step(before).anchor);
    expect(step(after).id).not.toBe(step(before).id);
    // 步骤还带着"第几步"的兜底
    expect(pick(before, "step").map((b) => b.fallback!.split("/").at(-1))).toEqual(["#0", "#1"]);
  });

  it("结构指纹不看讲稿：只改页的讲稿不变，改了画面上的字就变", async () => {
    const base = structureFingerprint(narrationBeats(BODY, await runScenes(BODY)));
    // 场景里的 say 写在场景代码里，改了会连带场景的编号一起变；第 4 步把讲稿移出文章后就没有这个问题
    const narration = BODY.replace("这一页的讲稿，说给人听的。", "换一种说法。");
    expect(structureFingerprint(narrationBeats(narration, await runScenes(narration)))).toBe(base);
    const written = BODY.replace("写给读者的第一句。", "画面上换了一句。");
    expect(structureFingerprint(narrationBeats(written, await runScenes(written)))).not.toBe(base);
  });

  it("时长参数：名字加毫秒，写错的条目跳过", () => {
    expect(parseTiming("p1:5200,p2:3000,1x9abc.0:4100")).toEqual({ p1: 5200, p2: 3000, "1x9abc.0": 4100 });
    expect(parseTiming("p1:abc,:300,p2:-5,P3:100,p4:99999999,p5:1200")).toEqual({ p5: 1200 });
    expect(parseTiming(undefined)).toBeUndefined();
    expect(parseTiming("乱写")).toBeUndefined();
  });
});
