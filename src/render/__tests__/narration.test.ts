import { describe, expect, it } from "vitest";
import { runScenes } from "@/core/scene/run";
import { sceneKey } from "@/core/scene/shared";
import { narrationBeats, parseTiming } from "../narration";

const SCENE = `const a = box("甲")
step("写给读者的第一句。", () => { say("讲的时候说的第一句。"); show(a) })
step("这一步没写讲稿。", () => pulse(a))`;

const BODY = `开场白，没有讲稿。

## 第一节

这一节的引子。

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

  it("时长参数：名字加毫秒，写错的条目跳过", () => {
    expect(parseTiming("p1:5200,p2:3000,1x9abc.0:4100")).toEqual({ p1: 5200, p2: 3000, "1x9abc.0": 4100 });
    expect(parseTiming("p1:abc,:300,p2:-5,P3:100,p4:99999999,p5:1200")).toEqual({ p5: 1200 });
    expect(parseTiming(undefined)).toBeUndefined();
    expect(parseTiming("乱写")).toBeUndefined();
  });
});
