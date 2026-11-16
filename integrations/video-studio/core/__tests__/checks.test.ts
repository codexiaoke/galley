import { describe, expect, it } from "vitest";
import { narrationChecks } from "../checks";
import type { StudioBeat } from "../types";

const beat = (id: string, kind: StudioBeat["kind"], page: number, text: string, extra: Partial<StudioBeat> = {}): StudioBeat =>
  ({ id, kind, page, title: null, section: null, text, suggestedMs: 1000, minMs: 500, ...extra });

describe("讲稿检查", () => {
  const scene = [
    beat("p0", "cover", 0, ""),
    beat("p1", "page", 1, "今天我们来聊聊 KV 缓存。先看模型怎么写字。", { targets: [{ id: "k1:b1", label: "方块 · 甲" }] }),
    beat("k1.0", "step", 1, "先看模型怎么写字，它是一个字一个字往外蹦的。"),
    beat("k1.1", "step", 1, ""),
    beat("p2", "page", 2, ""),
    beat("p3", "page", 3, "", { targets: [{ id: "p3:text-a", label: "正文" }] }),
    beat("k2.0", "step", 3, "改了代码，热重载一下就生效，不用重启。"),
    beat("p4", "ending", 4, ""),
  ];
  const checks = narrationChecks(scene);
  const at = (id: string) => checks.filter((check) => check.beatId === id).map((check) => check.code);

  it("空着的拍：场景的步骤和文字页要写；封面、结尾、场景页本身可以空着", () => {
    expect(at("k1.1")).toEqual(["empty"]);
    expect(at("p2")).toEqual(["empty"]);
    expect(at("p0")).toEqual([]);
    expect(at("p4")).toEqual([]);
    expect(at("p3")).not.toContain("empty");
  });

  it("页的开场和第一步说了同一句", () => {
    expect(at("k1.0")).toEqual(["repeat"]);
    expect(narrationChecks([scene[1], { ...scene[2], text: "它是一个字一个字往外蹦的。" }]).map((check) => check.code)).toEqual([]);
  });

  it("场景在第一步之前是空的", () => {
    expect(at("p3")).toEqual(["blank-frame"]);
    expect(at("p1")).toEqual([]);
  });

  it("会读错的多音字：长的词先查，同一处不报两遍", () => {
    const messages = checks.filter((check) => check.beatId === "k2.0").map((check) => check.message);
    expect(messages).toEqual([expect.stringContaining("热重载"), expect.stringContaining("重启")]);
  });
});
