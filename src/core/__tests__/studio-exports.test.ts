import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioExports } from "../studio-exports";

describe("本机视频导出目录", () => {
  const binding = { projectId: "project", revisionId: "revision", sourceVersion: "a".repeat(64) };
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), "galley-exports-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("首次导入旧成片，之后重命名和重启都使用持久化目录", () => {
    const id = randomUUID();
    const directory = path.join(root, "scene-demo", "exports", id);
    mkdirSync(directory, { recursive: true });
    const video = path.join(directory, "scene-demo-4k.mp4");
    writeFileSync(video, "existing video");
    writeFileSync(video.replace(".mp4", ".timeline.json"), JSON.stringify({ frames: 300, durationMs: 10000 }));
    writeFileSync(video.replace(".mp4", ".srt"), "existing subtitles");
    const first = new StudioExports(root);
    expect(first.list()).toHaveLength(1);
    expect(first.get(id)).toMatchObject({ state: "done", frames: 300, timeMs: 10000, bytes: 14 });
    first.rename(id, "  我的成片  ");
    const reopened = new StudioExports(root);
    expect(reopened.list()).toHaveLength(1);
    expect(reopened.get(id).name).toBe("我的成片");
    expect(reopened.file(id, "video")).toBe(video);
    expect(reopened.file(id, "subtitles")).toBe(video.replace(".mp4", ".srt"));
  });

  it("拒绝同时导出或删除活动任务，重启明确标记中断", () => {
    const store = new StudioExports(root);
    const job = store.create({ slug: "scene-demo", title: "文章", beats: [], voices: [] }, "成片", binding);
    store.progress(job.id, { phase: "rendering", frames: 90, timeMs: 3000, estimatedMs: 10000 });
    expect(() => store.create({ slug: "other", title: "其他文章", beats: [], voices: [] }, "其他成片", binding)).toThrow("已有视频正在导出");
    expect(() => store.remove(job.id)).toThrow("请先取消");
    expect(() => store.file(job.id, "video")).toThrow("尚未导出完成");
    store.cancel(job.id);
    expect(store.get(job.id).state).toBe("cancelling");
    const reopened = new StudioExports(root);
    expect(reopened.get(job.id)).toMatchObject({ state: "failed", frames: 90, error: "上次导出因工坊关闭而中断，请重新导出。" });
    expect(() => reopened.cancel(job.id)).toThrow("已经结束");
    expect(() => reopened.create({ slug: "other", title: "其他文章", beats: [], voices: [] }, "其他成片", binding)).not.toThrow();
  });

  it("删除只影响该次导出，保留配音和其他成片", () => {
    const store = new StudioExports(root);
    const first = store.create({ slug: "scene-demo", title: "文章", beats: [], voices: [] }, "第一版", binding);
    const file = store.output(first.id);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "video");
    store.complete(first.id);
    const voice = path.join(root, "scene-demo", "narration.wav");
    writeFileSync(voice, "voice");
    const second = store.create({ slug: "scene-demo", title: "文章", beats: [], voices: [] }, "第二版", binding);
    store.cancel(second.id); store.fail(second.id, "取消", true);
    store.remove(second.id);
    expect(store.file(first.id, "video")).toBe(file);
    store.remove(first.id);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(voice)).toBe(true);
    expect(new StudioExports(root).list()).toEqual([]);
    expect(() => store.get(first.id)).toThrow("没有找到");
  });

  it("名称不用于磁盘路径，并检查非法名称和文章别名", () => {
    const store = new StudioExports(root);
    expect(() => store.create({ slug: "../outside", title: "文章", beats: [], voices: [] }, "成片", binding)).toThrow("有效的文章");
    const job = store.create({ slug: "scene-demo", title: "文章", beats: [], voices: [] }, "成片", binding);
    const file = store.output(job.id);
    expect(() => store.rename(job.id, " ")).toThrow("1–120");
    expect(() => store.rename(job.id, "a".repeat(121))).toThrow("1–120");
    store.rename(job.id, "../../外部目录");
    expect(store.output(job.id)).toBe(file);
    store.fail(job.id, "取消", true);
    expect(new StudioExports(root).get(job.id).state).toBe("cancelled");
  });

  it("缺少讲稿配音时不创建任务，无旁白的拍可以导出", () => {
    const store = new StudioExports(root);
    const source = { slug: "scene-demo", title: "文章", beats: [{ id: "p0", text: "" }, { id: "p1", text: "讲稿" }], voices: [] as { id: string }[] };
    expect(() => store.create(source, "成片", binding)).toThrow("还有讲稿没有配音");
    expect(store.list()).toEqual([]);
    source.voices.push({ id: "p1" });
    expect(store.create(source, "成片", binding).state).toBe("running");
  });
});
