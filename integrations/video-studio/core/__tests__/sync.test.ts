import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OWNER } from "../../../../src/core/actor";
import type { Db } from "../../../../src/core/db/client";
import { openStudioDb } from "../db";
import { StudioProjects, voiceHash } from "../projects";
import type { Beat, StudioSource, Voice } from "../types";

const S1 = "a".repeat(64), S2 = "b".repeat(64), V1 = "c".repeat(64), V2 = "d".repeat(64);

/** 一篇文章：封面、一页、页里一个场景两步、结尾。key 是场景代码的指纹（拍点 id 用它），page 是页码 */
function article({ key = "k1", page = 1, first = "第一步画面", anchors = true }: { key?: string; page?: number; first?: string; anchors?: boolean } = {}): Beat[] {
  const a = <T extends object>(beat: T, anchor: string, fallback?: string) => anchors ? { ...beat, anchor, ...(fallback ? { fallback } : {}) } : beat;
  const target = (id: string, label: string, anchor: string) => anchors ? { id, label, anchor } : { id, label };
  return [
    a({ id: "p0", kind: "cover" as const, page: 0, title: null, section: null, text: "", suggestedMs: 1000, minMs: 1000 }, "cover"),
    a({ id: `p${page}`, kind: "page" as const, page, title: "一节", section: null, text: "页的讲稿", suggestedMs: 3000, minMs: 1200, targets: [target(`p${page}:text-x`, "正文", "page:s/text-x")] }, "page:s"),
    a({ id: `${key}.0`, kind: "step" as const, page, title: "一节", section: null, text: "第一步的讲稿", written: first, suggestedMs: 2000, minMs: 500, targets: [target(`${key}:b1`, "方块 · 甲", "page:s/scene1/f-jia")] }, `page:s/scene1/step:${first}`, "page:s/scene1/#0"),
    a({ id: `${key}.1`, kind: "step" as const, page, title: "一节", section: null, text: "第二步的讲稿", written: "第二步画面", suggestedMs: 2000, minMs: 500 }, "page:s/scene1/step:第二步画面", "page:s/scene1/#1"),
    a({ id: `p${page + 1}`, kind: "ending" as const, page: page + 1, title: null, section: null, text: "", suggestedMs: 1000, minMs: 1000 }, "ending"),
  ];
}
const source = (beats: Beat[], version: string, structure?: string): StudioSource => ({ galley: "https://blog.example.com", slug: "demo", title: "演示", present: "/posts/demo/present", revisedAt: null, version, ...(structure ? { structure } : {}), beats });
const voicesFor = (beats: Beat[]): Voice[] => beats.filter((beat) => beat.text).map((beat) => ({ id: beat.id, hash: voiceHash(beat.text), audio: `/audio/${beat.id}.wav`, durationMs: 1000, cues: [{ start: 0, end: 1, text: beat.text }] }));

let db: Db, projects: StudioProjects;
beforeEach(() => { db = openStudioDb(":memory:"); projects = new StudioProjects(db); });
afterEach(() => db.$client.close());

/** 建项目，给第一步写上工坊自己的讲稿和指向，讲稿审过 */
function start(beats: Beat[], src: StudioSource) {
  const created = projects.create(OWNER, src, "视频", null, voicesFor(beats));
  const edited = projects.revise(OWNER, created.id, created.currentRevisionId, [{ id: beats[2].id, text: "工坊改过的解说，指向甲", guides: [{ targetId: beats[2].targets![0].id, phrase: "指向甲" }] }], "写讲稿");
  projects.decide(OWNER, edited.id, (projects.submit(OWNER, edited.id, edited.currentRevisionId, "script"), edited.currentRevisionId), "script", "approve", "");
  return projects.get(OWNER, edited.id);
}

describe("按锚点同步来源", () => {
  it("旧项目（来源没有锚点）同步一次：按 id 对上，补上锚点，不建新版本、不用重新审查", () => {
    const old = article({ anchors: false });
    const p = start(old, source(old, V1));
    const result = projects.synchronize(OWNER, p.id, p.currentRevisionId, source(article(), V2, S1));
    expect(result.revision.number).toBe(p.revision.number);
    expect(result.revision.scriptStatus).toBe("approved");
    expect(result.revision.source.structure).toBe(S1);
    expect(result.revision.beats.every((beat) => beat.anchor)).toBe(true);
    expect(result.revision.beats[2]).toMatchObject({ text: "工坊改过的解说，指向甲", guides: [{ targetId: "k1:b1" }] });
    expect(result.revision.voices).toHaveLength(p.revision.voices.length);
  });

  it("画面那边变了、讲稿这边没变（目标清单、动画时长）：不建新版本；待审期间不能同步", () => {
    const before = article();
    const p = start(before, source(before, V1, S1));
    const after = article().map((beat) => beat.kind === "cover" ? { ...beat, minMs: 800 } : beat.targets ? { ...beat, targets: [...beat.targets, { id: "extra", label: "新元素", anchor: "page:s/extra" }] } : beat);
    const synced = projects.synchronize(OWNER, p.id, p.currentRevisionId, source(after, V2, S2));
    expect(synced.revision).toMatchObject({ number: p.revision.number, scriptStatus: "approved", source: { structure: S2 } });
    expect(synced.revision.beats[0].minMs).toBe(800);
    const fresh = projects.revise(OWNER, p.id, synced.currentRevisionId, [], "再改一版");
    projects.submit(OWNER, p.id, fresh.currentRevisionId, "script");
    expect(() => projects.synchronize(OWNER, p.id, fresh.currentRevisionId, source(article({ key: "k3" }), V1, S1))).toThrow("撤回待审");
  });

  it("前面插了一页、场景代码改了：编号全变，讲稿、指向、配音跟着锚点走", () => {
    const before = article();
    const p = start(before, source(before, V1, S1));
    const after = article({ key: "k2", page: 2 });
    const result = projects.synchronize(OWNER, p.id, p.currentRevisionId, source(after, V2, S2)).revision;
    // 编号变了，所以要建新版本重新审查
    expect(result.number).toBe(p.revision.number + 1);
    expect(result.scriptStatus).toBe("draft");
    expect(result.beats.map((beat) => beat.id)).toEqual(["p0", "p2", "k2.0", "k2.1", "p3"]);
    expect(result.beats[2]).toMatchObject({ text: "工坊改过的解说，指向甲", guides: [{ targetId: "k2:b1", phrase: "指向甲" }] });
    expect(result.beats.some((beat) => beat.check)).toBe(false);
    // 配音换成新编号，文字没变的全部留着
    expect(result.voices.map((voice) => voice.id).sort()).toEqual(["k2.1", "p2"]);
    expect(result.removed).toBeUndefined();
  });

  it("画面上那句话改了：按第几步兜底，讲稿保留但标成请核对；改过一次就清掉", () => {
    const before = article();
    const p = start(before, source(before, V1, S1));
    const after = article({ first: "第一步画面换了说法" });
    const synced = projects.synchronize(OWNER, p.id, p.currentRevisionId, source(after, V2, S2));
    expect(synced.revision.beats[2]).toMatchObject({ text: "工坊改过的解说，指向甲", check: "fallback" });
    expect(synced.revision.note).toContain("1 拍只按");
    const fixed = projects.revise(OWNER, p.id, synced.currentRevisionId, [{ id: "k1.0", text: "核对过的解说，指向甲" }], "核对");
    expect(fixed.revision.beats[2].check).toBeUndefined();
  });

  it("消失的拍点：写过的讲稿收进已移除，不悄悄丢掉", () => {
    const before = article();
    const p = start(before, source(before, V1, S1));
    const after = article().filter((beat) => beat.id !== "k1.0");
    const result = projects.synchronize(OWNER, p.id, p.currentRevisionId, source(after, V2, S2)).revision;
    expect(result.removed).toEqual([expect.objectContaining({ id: "k1.0", text: "工坊改过的解说，指向甲", guides: [expect.objectContaining({ phrase: "指向甲" })] })]);
    expect(result.note).toContain("1 拍已移除");
  });

  it("导出前的检查看结构指纹：文章的字句变了、结构没变照常导出，结构变了要先同步", () => {
    const before = article();
    const p = start(before, source(before, V1, S1));
    expect(() => projects.checkRenderSource(p.revision, source(before, V2, S1))).not.toThrow();
    expect(() => projects.checkRenderSource(p.revision, source(before, V1, S2))).toThrow("演示结构变了");
    // 旧项目没有结构指纹，还是按内容指纹比
    const old = article({ anchors: false });
    const legacy = start(old, source(old, V1));
    expect(() => projects.checkRenderSource(legacy.revision, source(old, V2, S1))).toThrow("演示结构变了");
  });
});
