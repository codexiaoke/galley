import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Actor } from "../../src/core/actor";
import { openDb } from "../../src/core/db/client";
import { invalid } from "../../src/core/errors";
import { StudioConnection } from "../../src/core/studio-connection";
import { StudioExports, exportIsActive } from "../../src/core/studio-exports";
import { StudioProjects, studioSourceSchema } from "../../src/core/studio-projects";
import type { StudioSource } from "../../src/core/studio-types";
import { exportVideo } from "./export";
import { StudioVoice } from "./voice";

export class StudioRuntime {
  readonly db;
  readonly projects;
  readonly exports;
  readonly connection;
  readonly voice;
  private activeExport: { id: string; controller: AbortController } | undefined;
  private shuttingDown = false;

  constructor(readonly directory: string) {
    this.db = openDb(path.join(directory, "studio.db"));
    this.projects = new StudioProjects(this.db); this.projects.recover();
    this.exports = new StudioExports(directory);
    const tokenFile = process.env.GALLEY_TOKEN_FILE;
    this.connection = new StudioConnection(this.db, directory, { url: process.env.GALLEY_URL ?? "http://localhost:3000", token: process.env.GALLEY_TOKEN?.trim() || (tokenFile && existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "") });
    this.voice = new StudioVoice(directory, process.env.STUDIO_TTS_SERVER ?? "my-voice-tts");
  }

  config() { return { ...this.connection.public(), ttsServer: this.voice.serverName, ttsFound: !!this.voice.launch(), dir: this.directory }; }

  private async remote(route: string, connection = this.connection.read()) {
    if (!connection.token) throw invalid("请先在工坊设置中填写站点地址和访问密钥。");
    const response = await fetch(`${connection.url}${route}`, { headers: { Authorization: `Bearer ${connection.token}` }, signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!response.headers.get("content-type")?.includes("application/json")) throw invalid(`站点接口没有返回 JSON（${response.status}），请确认地址和线上 Galley 版本。`);
    const data = await response.json();
    if (!response.ok) throw invalid(data.error ?? `站点返回了 ${response.status}。`);
    return data;
  }

  async connect(actor: Actor, url: string, token: string) {
    const candidate = this.connection.candidate(actor, url, token);
    const data = await this.remote("/narration.json", candidate);
    if (!Array.isArray(data.articles)) throw invalid("这个站点没有返回文章清单，请更新线上 Galley。");
    return this.connection.save(actor, candidate);
  }

  async articles() { return this.remote("/narration.json") as Promise<{ articles: { slug: string; title: string; narrated: number }[] }>; }

  async source(slug: string): Promise<StudioSource> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw invalid("文章别名无效。");
    const connection = this.connection.read();
    const data = await this.remote(`/posts/${slug}/narration.json`, connection);
    const parsed = studioSourceSchema.safeParse({ ...data, galley: connection.url });
    if (!parsed.success) throw invalid("线上 Galley 尚未提供演示版本信息，请部署当前版本后再建立项目。");
    return parsed.data;
  }

  async create(actor: Actor, slug: string, name: string, assignedAgentId: string | null) {
    const source = await this.source(slug);
    this.voice.migrateLegacy(source);
    return this.projects.create(actor, source, name, assignedAgentId, this.voice.voicesFor(source));
  }

  async sync(actor: Actor, id: string, revisionId: string) {
    const revision = this.projects.current(actor, id, revisionId);
    this.projects.checkConnectedSource(revision, this.connection.public().galley);
    const source = await this.source(revision.source.slug);
    return this.projects.synchronize(actor, id, revisionId, source);
  }

  generate(actor: Actor, id: string, revisionId: string, forceIds: string[] = []) {
    const revision = this.projects.beginVoices(actor, id, revisionId, forceIds);
    void (async () => {
      for (const beat of revision.beats) {
        if (!beat.text || revision.voices.some((voice) => voice.id === beat.id)) continue;
        this.projects.voiceProgress(revisionId, `正在生成「${beat.title || beat.id}」的配音…`);
        const voice = await this.voice.generate(beat.id, beat.text, forceIds.includes(beat.id), (message) => this.projects.voiceProgress(revisionId, message));
        this.projects.saveVoice(revisionId, voice);
      }
      this.projects.endVoices(actor, revisionId);
    })().catch((error: unknown) => this.projects.endVoices(actor, revisionId, error instanceof Error ? error.message : String(error)));
    return this.projects.get(actor, id);
  }

  sample(actor: Actor, id: string, revisionId: string) {
    const revision = this.projects.current(actor, id, revisionId);
    if (!revision.sampleExportId) return undefined;
    const job = this.exports.get(revision.sampleExportId);
    if (job.state === "done") this.exports.file(job.id, "video");
    return job;
  }

  async render(actor: Actor, id: string, revisionId: string, name: string) {
    const revision = this.projects.prepareRender(actor, id, revisionId);
    this.projects.checkConnectedSource(revision, this.connection.public().galley);
    const source = await this.source(revision.source.slug);
    this.projects.checkRenderSource(revision, source);
    this.projects.prepareRender(actor, id, revisionId);
    const job = this.exports.create({ ...source, beats: revision.beats, voices: revision.voices }, name, { projectId: id, revisionId, sourceVersion: source.version });
    this.projects.attachRender(actor, id, revisionId, job.id);
    const controller = new AbortController(); this.activeExport = { id: job.id, controller };
    const output = this.exports.output(job.id);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output.replace(/\.mp4$/, ".manifest.json"), JSON.stringify({ projectId: id, revisionId, source, beats: revision.beats, voices: revision.voices, width: 3840, height: 2160, fps: 30 }, null, 2));
    const url = new URL(source.present, source.galley); url.searchParams.set("version", source.version);
    void exportVideo({ url: url.toString(), beats: revision.beats, voices: revision.voices,
      audioPath: (beatId) => this.voice.file(revision.voices.find((voice) => voice.id === beatId)!.audio), output, signal: controller.signal,
      progress: (progress) => this.exports.progress(job.id, progress),
    }).then(() => { this.exports.complete(job.id); }, (error: unknown) => {
      this.exports.fail(job.id, error instanceof Error ? error.message.split("\n")[0] : String(error), controller.signal.aborted && !this.shuttingDown);
    }).finally(() => { this.activeExport = undefined; }).catch((error: unknown) => console.error("保存导出记录失败：", error));
    return job;
  }

  exportList(actor: Actor) {
    return this.projects.exportList(actor, this.exports.list());
  }

  cancel(actor: Actor, exportId: string) {
    const job = this.exports.get(exportId); this.projects.checkExportAccess(actor, job);
    const result = this.exports.cancel(exportId);
    if (this.activeExport?.id === exportId) this.activeExport.controller.abort(new Error("导出已取消。"));
    return result;
  }

  unload(actor: Actor) {
    this.projects.prepareUnload(actor);
    return this.voice.unload();
  }

  close() {
    this.shuttingDown = true;
    if (this.activeExport && exportIsActive(this.exports.get(this.activeExport.id))) this.activeExport.controller.abort(new Error("工坊关闭，导出已中断。"));
    void this.voice.close().catch(() => undefined);
  }
}
