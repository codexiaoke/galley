import type { Voice } from "../../core/studio-types";
import { describe, expect, it } from "vitest";
import { assertTimeline, subtitleFile } from "../../../integrations/video-studio/export";
import { beatLength } from "../../../integrations/video-studio/timing.js";

describe("视频工坊的时间轴", () => {
  it("给配音留停顿，同时保证动画有时间放完", () => {
    expect(beatLength({ minMs: 1200, suggestedMs: 5000 }, { durationMs: 2000 })).toBe(2350);
    expect(beatLength({ minMs: 4000, suggestedMs: 5000 }, { durationMs: 2000 })).toBe(4000);
    expect(beatLength({ minMs: 1200, suggestedMs: 5000 }, undefined)).toBe(5000);
  });

  it("字幕跟实际拍点对齐，前面自走节奏的播放器不会造成字幕偏移", () => {
    const voice: Voice = { id: "scene.0", hash: "test", audio: "/audio/test.wav", durationMs: 2000,
      cues: [{ start: 0.25, end: 1.875, text: "按实际画面对齐" }] };
    const srt = subtitleFile([{ id: "p0", at: 0 }, { id: "scene.0", at: 62123 }], [voice]);
    expect(srt).toBe("1\n00:01:02,373 --> 00:01:03,998\n按实际画面对齐\n");
  });

  it("拒绝中途重载、重复拍点、遗漏和时序倒退的成片", () => {
    const beats = [{ id: "p0" }, { id: "p1" }];
    expect(() => assertTimeline(beats, [{ id: "p0", at: 0 }, { id: "p1", at: 3500 }])).not.toThrow();
    for (const timeline of [
      [{ id: "p0", at: 0 }],
      [{ id: "p0", at: 0 }, { id: "p0", at: 3500 }],
      [{ id: "p0", at: 3500 }, { id: "p1", at: 0 }],
    ]) expect(() => assertTimeline(beats, timeline)).toThrow("时间轴与讲稿不一致");
  });
});
