import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { voiceHash } from "../../src/core/studio-projects";
import type { StudioSource, Voice } from "../../src/core/studio-types";

type Launch = { command: string; args: string[]; env?: Record<string, string> };
const resultSchema = z.object({ duration_seconds: z.number().positive().finite(), subtitle_cues: z.array(z.object({ start: z.number().nonnegative(), end: z.number().nonnegative(), text: z.string() })).default([]) });
const safe = (id: string) => id.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);

export class StudioVoice {
  private client: Promise<Client> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  readonly directory: string;
  constructor(private root: string, readonly serverName: string) {
    this.directory = path.join(root, "voice-assets"); mkdirSync(this.directory, { recursive: true });
  }

  launch(): Launch | null {
    if (process.env.STUDIO_TTS_COMMAND?.trim()) {
      const [command, ...args] = process.env.STUDIO_TTS_COMMAND.trim().split(/\s+/); return { command, args };
    }
    const file = path.join(homedir(), ".claude.json");
    if (!existsSync(file)) return null;
    const entry = JSON.parse(readFileSync(file, "utf8")).mcpServers?.[this.serverName] as Launch | undefined;
    return entry?.command ? { ...entry, args: entry.args ?? [] } : null;
  }

  private connect(): Promise<Client> {
    if (this.client) return this.client;
    const launch = this.launch();
    if (!launch) throw new Error(`没有找到配音服务「${this.serverName}」，请检查本机 MCP 配置。`);
    const connecting = (async () => {
      const transport = new StdioClientTransport({ ...launch, env: { ...process.env as Record<string, string>, ...launch.env }, stderr: "ignore" });
      const client = new Client({ name: "galley-video-studio", version: "0.2.0" });
      await client.connect(transport); transport.onclose = () => { this.client = null; }; return client;
    })();
    this.client = connecting; void connecting.catch(() => { this.client = null; }); return connecting;
  }

  private cachePath(text: string) { return path.join(this.directory, `${createHash("sha256").update(`${this.serverName}\n${text}`).digest("hex")}.json`); }
  private cached(id: string, text: string): Voice | null {
    const file = this.cachePath(text);
    if (!existsSync(file)) return null;
    const voice = JSON.parse(readFileSync(file, "utf8")) as Voice;
    return voice.hash === voiceHash(text) && existsSync(this.file(voice.audio)) ? { ...voice, id } : null;
  }
  file(audio: string) {
    const match = /^\/audio\/([a-f0-9-]{36}\.wav)$/.exec(audio);
    if (!match) throw new Error("配音文件地址无效。");
    return path.join(this.directory, match[1]);
  }

  /** 每篇文章只迁移一次旧缓存；以后只读取 voice-assets，原文件保留作备份。 */
  migrateLegacy(source: StudioSource) {
    const marker = path.join(this.directory, `migrated-${source.slug}.json`);
    if (existsSync(marker)) return;
    const imported: string[] = [];
    for (const beat of source.beats) {
      if (!beat.text || this.cached(beat.id, beat.text)) continue;
      const file = path.join(this.root, source.slug, `${safe(beat.id)}.voice.json`);
      const audio = path.join(this.root, source.slug, `${safe(beat.id)}.wav`);
      if (!existsSync(file) || !existsSync(audio)) continue;
      const legacy = JSON.parse(readFileSync(file, "utf8")) as Voice;
      if (legacy.hash !== createHash("sha1").update(beat.text).digest("hex").slice(0, 16)) continue;
      const name = `${randomUUID()}.wav`; copyFileSync(audio, path.join(this.directory, name));
      const voice = { ...legacy, id: beat.id, hash: voiceHash(beat.text), audio: `/audio/${name}` };
      writeFileSync(this.cachePath(beat.text), JSON.stringify(voice)); imported.push(beat.id);
    }
    writeFileSync(marker, JSON.stringify({ sourceVersion: source.version, imported, migratedAt: new Date().toISOString() }));
  }

  voicesFor(source: StudioSource): Voice[] {
    return source.beats.flatMap((beat) => { const voice = beat.text ? this.cached(beat.id, beat.text) : null; return voice ? [voice] : []; });
  }

  generate(id: string, text: string, force: boolean, progress: (message: string) => void): Promise<Voice> {
    const run = async () => {
      if (!force) { const hit = this.cached(id, text); if (hit) return hit; }
      const file = `${randomUUID()}.wav`;
      const client = await this.connect();
      const result = await client.callTool({ name: "generate_voiceover", arguments: { text, output_path: path.join(this.directory, file), subtitle_max_chars: 20 } }, undefined,
        { timeout: 20 * 60 * 1000, resetTimeoutOnProgress: true, onprogress: (value) => progress(value.message ?? "正在生成配音…") });
      const content = result.content as { type: string; text?: string }[] | undefined;
      if (result.isError) throw new Error(content?.find((item) => item.type === "text")?.text ?? "配音服务返回错误。");
      const data = resultSchema.parse(result.structuredContent ?? JSON.parse(content?.find((item) => item.type === "text")?.text ?? "{}"));
      if (!existsSync(path.join(this.directory, file)) || data.subtitle_cues.some((cue) => cue.end < cue.start || cue.end > data.duration_seconds + 0.5)) throw new Error("配音服务返回的音频或字幕时间无效。");
      const voice: Voice = { id, hash: voiceHash(text), audio: `/audio/${file}`, durationMs: Math.round(data.duration_seconds * 1000), cues: data.subtitle_cues };
      writeFileSync(this.cachePath(text), JSON.stringify(voice)); return voice;
    };
    const job = this.queue.then(run, run); this.queue = job.catch(() => undefined); return job;
  }

  async unload() { if (this.client) await (await this.client).callTool({ name: "unload_voice_model", arguments: {} }); }
  async close() { if (this.client) await (await this.client).close(); }
}
