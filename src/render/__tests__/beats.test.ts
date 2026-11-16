import { describe, expect, it } from "vitest";
import { runScenes } from "@/core/scene/run";
import { sceneKey } from "@/core/scene/shared";
import { presentationBeats, parseTiming } from "../beats";
import { structureFingerprint } from "@/core/presentation-version";
import { removeNarration } from "@/core/markup/narration";

const SCENE = `const a = box("甲")
step("写给读者的第一句。", () => { show(a) })
step("第二步。", () => pulse(a))`;

const BODY = `开场白。

## 第一节

:::present
这一节的引子。
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

describe("拍点清单（演示结构）", () => {
  it("按播放的顺序一拍一拍给出：封面、每一页、场景的每一步、结尾", async () => {
    const beats = presentationBeats(BODY, await runScenes(BODY));
    const key = sceneKey(SCENE);
    expect(beats.map((b) => b.id)).toEqual(["p0", "p1", "p2", "p3", `${key}.0`, `${key}.1`, "p4", "p5"]);
    expect(beats.map((b) => b.kind)).toEqual(["cover", "page", "page", "page", "step", "step", "page", "ending"]);
    // 博客只给结构，没有讲稿
    expect(beats.some((b) => "text" in b || "guides" in b)).toBe(false);
    expect(beats.find((b) => b.id === "p1")).toMatchObject({ title: null });
    expect(beats.find((b) => b.id === "p2")).toMatchObject({ title: "第一节" });
    // 场景独占一页（第 3 页）：这一页本身只是亮个相就开始走步骤
    expect(beats.find((b) => b.id === "p3")).toMatchObject({ section: "第一节", suggestedMs: 1200 });
    // 封面和结尾只停一秒
    for (const kind of ["cover", "ending"]) expect(beats.find((b) => b.kind === kind)).toMatchObject({ suggestedMs: 1000, minMs: 1000 });
  });

  it("场景的每一步：画面上那句话，最短要等动画放完", async () => {
    const beats = presentationBeats(BODY, await runScenes(BODY));
    const key = sceneKey(SCENE);
    const [first, second] = beats.filter((b) => b.kind === "step");
    expect(first).toMatchObject({ id: `${key}.0`, page: 3, written: "写给读者的第一句。" });
    expect(second).toMatchObject({ written: "第二步。" });
    expect(first.minMs).toBeGreaterThan(300);
    expect(first.suggestedMs).toBeGreaterThan(first.minMs);
    expect(second.suggestedMs).toBeGreaterThan(second.minMs);
  });

  it("有自己走节奏的播放器的页会标出来", async () => {
    const beats = presentationBeats(BODY, await runScenes(BODY));
    expect(beats.find((b) => b.id === "p4")).toMatchObject({ selfPaced: true, title: "第二节" });
    expect(beats.filter((b) => b.selfPaced).map((b) => b.id)).toEqual(["p4"]);
  });

  it("锚点按内容算：前面插一页、场景代码改了，原来的页、步骤和元素还对得上", async () => {
    const before = presentationBeats(BODY, await runScenes(BODY));
    const inserted = BODY.replace("## 第二节", "## 新加的一节\n\n新加的内容。\n\n## 第二节").replace("const a = box(\"甲\")", "const z = box(\"新\")\nconst a = box(\"甲\")");
    const after = presentationBeats(inserted, await runScenes(inserted));
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

  it("结构指纹：画面上的字变了就变；历史版本里留着讲稿的文章，摘掉后锚点和没写讲稿的一样", async () => {
    const base = structureFingerprint(presentationBeats(BODY, await runScenes(BODY)));
    const written = BODY.replace("写给读者的第一句。", "画面上换了一句。");
    expect(structureFingerprint(presentationBeats(written, await runScenes(written)))).not.toBe(base);
    const legacy = removeNarration(BODY.replace("## 第一节\n", "## 第一节\n\n:::notes\n以前写在文章里的讲稿。\n:::\n").replace("{ show(a) }", '{ say("以前的解说。"); show(a) }')).body;
    expect(legacy).not.toContain("以前");
    // 摘掉 say() 会让场景代码差一个空格，场景的编号跟着变；锚点不变，工坊同步时对得上
    const anchors = (beats: { anchor?: string }[]) => beats.map((b) => b.anchor);
    expect(anchors(presentationBeats(legacy, await runScenes(legacy)))).toEqual(anchors(presentationBeats(BODY, await runScenes(BODY))));
  });

  it("时长参数：名字加毫秒，写错的条目跳过", () => {
    expect(parseTiming("p1:5200,p2:3000,1x9abc.0:4100")).toEqual({ p1: 5200, p2: 3000, "1x9abc.0": 4100 });
    expect(parseTiming("p1:abc,:300,p2:-5,P3:100,p4:99999999,p5:1200")).toEqual({ p5: 1200 });
    expect(parseTiming(undefined)).toBeUndefined();
    expect(parseTiming("乱写")).toBeUndefined();
  });
});
