import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export type ExportProgress = { phase: "preparing" | "rendering" | "encoding"; frames: number; timeMs: number; estimatedMs: number };
const recordSchema = z.object({
  id: z.string().uuid(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string(), name: z.string().min(1).max(120),
  state: z.enum(["running", "cancelling", "done", "cancelled", "failed"]),
  createdAt: z.string(), updatedAt: z.string(), width: z.literal(3840), height: z.literal(2160), fps: z.literal(30),
  phase: z.enum(["preparing", "rendering", "encoding"]), frames: z.number().nonnegative(), timeMs: z.number().nonnegative(), estimatedMs: z.number().nonnegative(),
  bytes: z.number().nonnegative(), error: z.string().optional(),
  projectId: z.string().nullable(), revisionId: z.string().nullable(), sourceVersion: z.string().nullable(),
});
export type StudioExport = z.infer<typeof recordSchema>;
type StudioSource = { slug: string; title: string; beats: { id: string; text: string }[]; voices: { id: string }[] };
export type ExportBinding = { projectId: string; revisionId: string; sourceVersion: string };

export class StudioExportError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export const exportIsActive = (job: StudioExport) => job.state === "running" || job.state === "cancelling";

/** 本机视频工坊的导出目录。规则和持久化集中在这里，HTTP 层只负责调度渲染进程。 */
export class StudioExports {
  private records: StudioExport[];
  private readonly index: string;

  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
    this.index = path.join(root, "exports.json");
    if (existsSync(this.index)) {
      const stored = JSON.parse(readFileSync(this.index, "utf8"));
      // 一次性迁移已有目录，原文件留作备份；历史成片不冒充经过了新版审查。
      if (Array.isArray(stored)) {
        copyFileSync(this.index, path.join(root, "exports-before-projects.json"));
        this.records = z.array(recordSchema).parse(stored.map((job) => ({ ...job, projectId: null, revisionId: null, sourceVersion: null })));
      } else {
        this.records = z.object({ version: z.literal(2), records: z.array(recordSchema) }).parse(stored).records;
      }
    } else this.records = this.importCompletedFiles();
    // 进程重启后原来的渲染器已不在；明确记录中断，不能一直显示“正在导出”。
    this.records = this.records.map((job) => exportIsActive(job)
      ? { ...job, state: "failed", updatedAt: new Date().toISOString(), error: "上次导出因工坊关闭而中断，请重新导出。" }
      : job);
    this.save();
  }

  private save() {
    const temporary = `${this.index}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 2, records: this.records }, null, 2));
    renameSync(temporary, this.index);
  }

  /** 首次建立目录时，把此前已经导出的成片写入新索引。以后只使用这一份索引。 */
  private importCompletedFiles(): StudioExport[] {
    const records: StudioExport[] = [];
    for (const project of readdirSync(this.root, { withFileTypes: true })) {
      if (!project.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.name)) continue;
      const directory = path.join(this.root, project.name, "exports");
      if (!existsSync(directory)) continue;
      for (const folder of readdirSync(directory, { withFileTypes: true })) {
        if (!folder.isDirectory() || !z.string().uuid().safeParse(folder.name).success) continue;
        const video = path.join(directory, folder.name, `${project.name}-4k.mp4`);
        if (!existsSync(video)) continue;
        const timeline = JSON.parse(readFileSync(video.replace(/\.mp4$/, ".timeline.json"), "utf8")) as { frames: number; durationMs: number };
        const stat = statSync(video);
        records.push(recordSchema.parse({ id: folder.name, slug: project.name, title: project.name, name: `${project.name} · 4K`,
          state: "done", createdAt: stat.mtime.toISOString(), updatedAt: stat.mtime.toISOString(), width: 3840, height: 2160, fps: 30,
          phase: "encoding", frames: timeline.frames, timeMs: timeline.durationMs, estimatedMs: timeline.durationMs, bytes: stat.size,
          projectId: null, revisionId: null, sourceVersion: null }));
      }
    }
    return records;
  }

  list(): StudioExport[] {
    return structuredClone(this.records).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): StudioExport {
    const record = this.records.find((job) => job.id === id);
    if (!record) throw new StudioExportError("没有找到这条导出记录。", 404);
    return structuredClone(record);
  }

  private update(id: string, change: Partial<StudioExport>): StudioExport {
    const index = this.records.findIndex((job) => job.id === id);
    if (index < 0) throw new StudioExportError("没有找到这条导出记录。", 404);
    this.records[index] = { ...this.records[index], ...change, updatedAt: new Date().toISOString() };
    this.save();
    return this.get(id);
  }

  create(source: StudioSource, name: string, binding: ExportBinding): StudioExport {
    const { slug, title, beats, voices } = source;
    if (beats.some((beat) => beat.text && !voices.some((voice) => voice.id === beat.id))) throw new StudioExportError("还有讲稿没有配音，请先生成配音。");
    if (this.records.some(exportIsActive)) throw new StudioExportError("已有视频正在导出，请等它完成或先取消。", 409);
    const now = new Date().toISOString();
    const parsed = recordSchema.safeParse({ id: randomUUID(), slug, title, name: name.trim(), state: "running", createdAt: now, updatedAt: now,
      width: 3840, height: 2160, fps: 30, phase: "preparing", frames: 0, timeMs: 0, estimatedMs: 0, bytes: 0, ...binding });
    if (!parsed.success) throw new StudioExportError("请填写 1–120 个字的视频名称，并选择有效的文章。");
    this.records.push(parsed.data);
    this.save();
    return structuredClone(parsed.data);
  }

  progress(id: string, progress: ExportProgress) {
    if (!exportIsActive(this.get(id))) throw new StudioExportError("这次导出已经结束。", 409);
    return this.update(id, progress);
  }

  complete(id: string) {
    return this.update(id, { state: "done", bytes: statSync(this.output(id)).size, error: undefined });
  }

  fail(id: string, error: string, cancelled: boolean) {
    return this.update(id, { state: cancelled ? "cancelled" : "failed", error: cancelled ? undefined : error });
  }

  cancel(id: string) {
    const job = this.get(id);
    if (!exportIsActive(job)) throw new StudioExportError("这次导出已经结束。", 409);
    return this.update(id, { state: "cancelling" });
  }

  rename(id: string, name: string) {
    const value = name.trim();
    if (!value || value.length > 120) throw new StudioExportError("视频名称需要 1–120 个字。");
    return this.update(id, { name: value });
  }

  remove(id: string) {
    const job = this.get(id);
    if (exportIsActive(job)) throw new StudioExportError("请先取消导出，再删除记录。", 409);
    rmSync(path.dirname(this.output(id)), { recursive: true, force: true });
    this.records = this.records.filter((record) => record.id !== id);
    this.save();
  }

  output(id: string): string {
    const job = this.get(id);
    return path.join(this.root, job.slug, "exports", job.id, `${job.slug}-4k.mp4`);
  }

  file(id: string, kind: "video" | "subtitles"): string {
    if (this.get(id).state !== "done") throw new StudioExportError("视频尚未导出完成。", 409);
    const file = kind === "video" ? this.output(id) : this.output(id).replace(/\.mp4$/, ".srt");
    if (!existsSync(file)) throw new StudioExportError("文件已被移走或删除，请重新导出。", 404);
    return file;
  }
}
