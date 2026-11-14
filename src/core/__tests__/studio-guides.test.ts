import { describe, expect, it } from "vitest";
import { guidesSchema, resolveGuidePlan, validateBeatGuides } from "../studio-guides";
import type { Beat, Voice } from "../studio-types";

const beat: Beat = { id: "scene.1", kind: "step", page: 1, title: null, section: null, text: "先看页面，然后挪进 Worker。", suggestedMs: 6000, minMs: 1000, targets: [{ id: "scene:page", label: "页面" }, { id: "scene:worker", label: "Worker" }], guides: [{ targetId: "scene:page", phrase: "先看页面" }, { targetId: "scene:worker", phrase: "然后挪进 Worker" }] };
const voice: Voice = { id: beat.id, hash: "test", audio: "test.wav", durationMs: 6500, cues: [{ start: 0, end: 1.6, text: "先看页面，" }, { start: 2.2, end: 6.5, text: "然后挪进 Worker。" }] };

describe("讲解指向", () => {
  it("强调方式进入配音时间计划，非法模式不能保存", () => {
    const b = { ...beat, guides: [{ ...beat.guides![0], emphasis: "zoom" as const }, { ...beat.guides![1], emphasis: "point" as const }] };
    expect(resolveGuidePlan([b], [voice])[0].cues.map((cue) => cue.emphasis)).toEqual(["zoom", "point"]);
    expect(guidesSchema.safeParse([{ targetId: "scene:page", phrase: "先看页面", emphasis: "unknown" }]).success).toBe(false);
  });
  it("对齐真实字幕并保留停顿，目标稍提前到达，下一目标接管前截断", () => {
    expect(resolveGuidePlan([beat], [voice])).toEqual([{ id: beat.id, cues: [{ targetId: "scene:page", emphasis: "focus", startMs: 0, endMs: 1750 }, { targetId: "scene:worker", emphasis: "focus", startMs: 1750, endMs: 6500 }] }]);
    const slower = { ...voice, durationMs: 13000, cues: voice.cues.map((cue) => ({ ...cue, start: cue.start * 2, end: cue.end * 2 })) };
    expect(resolveGuidePlan([beat], [slower])[0].cues[1].startMs).toBe(3950);
  });
  it("短语可以跨越两个字幕段，字幕段内按字数插值", () => {
    const b = { ...beat, guides: [{ targetId: "scene:worker", phrase: "页面，然后" }] };
    expect(resolveGuidePlan([b], [voice])[0].cues[0]).toEqual({ targetId: "scene:worker", emphasis: "focus", startMs: 350, endMs: 3510 });
  });
  it("拒绝不存在、歧义、重叠、逆序的讲稿或目标", () => {
    expect(() => validateBeatGuides({ ...beat, guides: [{ targetId: "missing", phrase: "页面" }] })).toThrow("目标已不存在");
    expect(() => validateBeatGuides({ ...beat, text: "页面，页面", guides: [{ targetId: "scene:page", phrase: "页面" }] })).toThrow("唯一出现");
    expect(() => validateBeatGuides({ ...beat, text: "新讲稿" })).toThrow("唯一出现");
    expect(() => validateBeatGuides({ ...beat, guides: [...beat.guides!].reverse() })).toThrow("顺序");
    expect(() => validateBeatGuides({ ...beat, guides: [beat.guides![0], { targetId: "scene:worker", phrase: "页面然后" }] })).toThrow("重叠");
  });
  it("不使用不匹配字幕；只有草稿预览可按讲稿估时", () => {
    expect(() => resolveGuidePlan([beat], [{ ...voice, cues: [{ start: 0, end: 6, text: "别的录音" }] }])).toThrow("字幕与讲稿不一致");
    expect(() => resolveGuidePlan([beat], [])).toThrow("缺少配音");
    expect(resolveGuidePlan([beat], [], true)[0].cues[1].endMs).toBe(6000);
    expect(resolveGuidePlan([{ ...beat, guides: [] }], [])).toEqual([]);
  });
});
