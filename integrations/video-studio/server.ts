/**
 * Galley 视频工坊：把一篇文章做成配了音的视频的本地工具。
 *
 * 一个只在本机监听的小服务，加一个网页（index.html）。服务做三件网页自己做不了的事：
 * 1. 带着接入密钥向 Galley 要讲稿清单（密钥留在这一侧，不进浏览器）；
 * 2. 连上配音的 MCP 服务（一个本机的命令行进程，网页没法启动），按拍生成配音；
 * 3. 把生成的音频存在本机，再发给网页播放。
 *
 * 用法：pnpm studio，然后打开 http://localhost:4321
 *
 * 环境变量：
 * - GALLEY_URL          Galley 的地址，默认 http://localhost:3000
 * - GALLEY_TOKEN        接入密钥（后台"MCP 管理"里建）；或者 GALLEY_TOKEN_FILE 指向一个只写着密钥的文件
 * - STUDIO_PORT         监听的端口，默认 4321
 * - STUDIO_DIR          音频存在哪里，默认 ~/galley-studio
 * - STUDIO_TTS_SERVER   配音 MCP 服务在 ~/.claude.json 里登记的名字，默认 my-voice-tts
 * - STUDIO_TTS_COMMAND  不想从 ~/.claude.json 里读时，直接给出启动命令（用空格分开）
 *
 * 配音服务要有一个 generate_voiceover 工具：收 { text, output_path }，
 * 返回 { audio_path, duration_seconds, subtitle_cues: [{ start, end, text }] }。
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PORT = Number(process.env.STUDIO_PORT ?? 4321);
const GALLEY_URL = (process.env.GALLEY_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const WORK_DIR = process.env.STUDIO_DIR ?? path.join(homedir(), "galley-studio");
const TTS_SERVER = process.env.STUDIO_TTS_SERVER ?? "my-voice-tts";
const HERE = path.dirname(new URL(import.meta.url).pathname);

function galleyToken(): string {
  if (process.env.GALLEY_TOKEN) return process.env.GALLEY_TOKEN.trim();
  const file = process.env.GALLEY_TOKEN_FILE;
  return file && existsSync(file) ? readFileSync(file, "utf8").trim() : "";
}

/* ---------- 配音的 MCP 服务 ---------- */

type Launch = { command: string; args: string[]; env?: Record<string, string> };

/** 配音服务怎么启动：环境变量里直接给了命令就用它，否则去 ~/.claude.json 里按名字找 */
function ttsLaunch(): Launch | null {
  const direct = process.env.STUDIO_TTS_COMMAND?.trim();
  if (direct) {
    const [command, ...args] = direct.split(/\s+/);
    return { command, args };
  }
  try {
    const config = JSON.parse(readFileSync(path.join(homedir(), ".claude.json"), "utf8")) as { mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }> };
    const entry = config.mcpServers?.[TTS_SERVER];
    return entry?.command ? { command: entry.command, args: entry.args ?? [], env: entry.env } : null;
  } catch {
    return null;
  }
}

let client: Promise<Client> | null = null;

/** 连上配音服务。第一次生成时才启动它；之后一直连着，模型不用反复加载 */
function tts(): Promise<Client> {
  if (client) return client;
  const launch = ttsLaunch();
  if (!launch) return Promise.reject(new Error(`没有找到配音服务「${TTS_SERVER}」。在 ~/.claude.json 的 mcpServers 里登记它，或者用 STUDIO_TTS_COMMAND 给出启动命令。`));
  const connecting = (async () => {
    const transport = new StdioClientTransport({ command: launch.command, args: launch.args, env: { ...(process.env as Record<string, string>), ...launch.env }, stderr: "ignore" });
    const c = new Client({ name: "galley-video-studio", version: "0.1.0" });
    await c.connect(transport);
    transport.onclose = () => void (client = null);
    return c;
  })();
  client = connecting;
  connecting.catch(() => void (client = null));
  return connecting;
}

type Cue = { start: number; end: number; text: string };
type Voice = { id: string; hash: string; audio: string; durationMs: number; cues: Cue[] };
type ToolResult = { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };

const safe = (name: string) => name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || "_";
const hashOf = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 16);
const metaPath = (project: string, id: string) => path.join(WORK_DIR, safe(project), `${safe(id)}.voice.json`);
const wavPath = (project: string, id: string) => path.join(WORK_DIR, safe(project), `${safe(id)}.wav`);

/** 这一拍的配音以前生成过、讲稿也没变：直接用 */
function cached(project: string, id: string, text: string): Voice | null {
  try {
    const voice = JSON.parse(readFileSync(metaPath(project, id), "utf8")) as Voice;
    return voice.hash === hashOf(text) && existsSync(wavPath(project, id)) ? voice : null;
  } catch {
    return null;
  }
}

/** 配音一次只生成一段：模型只有一个，同时来的请求排队 */
let queue: Promise<unknown> = Promise.resolve();

function generate(project: string, id: string, text: string, onProgress: (message: string) => void): Promise<Voice> {
  const run = async (): Promise<Voice> => {
    const hit = cached(project, id, text);
    if (hit) return hit;
    mkdirSync(path.join(WORK_DIR, safe(project)), { recursive: true });
    const c = await tts();
    const result = (await c.callTool(
      // 字幕一条最多 20 个字：和演示里一行字幕的宽度差不多
      { name: "generate_voiceover", arguments: { text, output_path: wavPath(project, id), subtitle_max_chars: 20 } },
      undefined,
      // 第一次要加载模型，一段配音可能要几分钟：有进度就不算超时
      { timeout: 20 * 60 * 1000, resetTimeoutOnProgress: true, onprogress: (p) => onProgress(p.message ?? `${p.progress}/${p.total ?? "?"}`) },
    )) as ToolResult;
    const raw = result.structuredContent ?? JSON.parse(result.content?.find((item) => item.type === "text")?.text ?? "{}");
    const data = raw as { duration_seconds?: number; subtitle_cues?: Cue[]; error?: string };
    if (result.isError || typeof data.duration_seconds !== "number") throw new Error(data.error ?? result.content?.[0]?.text ?? "配音服务没有返回结果。");
    const voice: Voice = { id, hash: hashOf(text), audio: `/audio/${safe(project)}/${safe(id)}.wav`, durationMs: Math.round(data.duration_seconds * 1000), cues: data.subtitle_cues ?? [] };
    writeFileSync(metaPath(project, id), JSON.stringify(voice, null, 2));
    return voice;
  };
  const job = queue.then(run, run);
  queue = job.catch(() => undefined);
  return job;
}

/* ---------- HTTP ---------- */

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 2_000_000) throw new Error("请求太大了。");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return void res.end(readFileSync(path.join(HERE, "index.html")));
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, { galley: GALLEY_URL, hasToken: !!galleyToken(), ttsServer: TTS_SERVER, ttsFound: !!ttsLaunch(), dir: WORK_DIR });
    }

    // 讲稿清单：带着密钥向 Galley 要，顺便带上以前生成过的配音
    if (req.method === "POST" && url.pathname === "/api/narration") {
      const { slug } = await readJson<{ slug?: string }>(req);
      if (!slug || !SLUG.test(slug)) return json(res, 400, { error: "文章的别名只能用小写字母、数字和连字符。" });
      const token = galleyToken();
      if (!token) return json(res, 400, { error: "还没有接入密钥。启动时用 GALLEY_TOKEN 或 GALLEY_TOKEN_FILE 给出（在 Galley 后台的「MCP 管理」里建一个）。" });
      const reply = await fetch(`${GALLEY_URL}/posts/${slug}/narration.json`, { headers: { Authorization: `Bearer ${token}` } });
      const data = (await reply.json().catch(() => ({}))) as { error?: string; beats?: { id: string; text: string }[] };
      if (!reply.ok || !data.beats) return json(res, reply.status === 200 ? 502 : reply.status, { error: data.error ?? `Galley 返回了 ${reply.status}。` });
      const voices = data.beats.flatMap((beat) => (beat.text ? [cached(slug, beat.id, beat.text)] : [])).filter(Boolean);
      return json(res, 200, { ...data, galley: GALLEY_URL, voices });
    }

    // 给一拍配音。边生成边把进度一行一行发回去，最后一行是结果
    if (req.method === "POST" && url.pathname === "/api/voice") {
      const { project, id, text } = await readJson<{ project?: string; id?: string; text?: string }>(req);
      if (!project || !SLUG.test(project) || !id || !text?.trim() || text.length > 2000) return json(res, 400, { error: "参数不对。" });
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
      const line = (body: unknown) => res.write(`${JSON.stringify(body)}\n`);
      try {
        line({ voice: await generate(project, id, text, (message) => line({ progress: message })) });
      } catch (e) {
        line({ error: e instanceof Error ? e.message : String(e) });
      }
      return void res.end();
    }

    // 卸载配音模型，把内存还回去
    if (req.method === "POST" && url.pathname === "/api/unload") {
      if (!client) return json(res, 200, { unloaded: false });
      await (await client).callTool({ name: "unload_voice_model", arguments: {} });
      return json(res, 200, { unloaded: true });
    }

    if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
      const [project, file] = url.pathname.slice("/audio/".length).split("/");
      const full = path.join(WORK_DIR, safe(project ?? ""), safe(file ?? ""));
      if (!file?.endsWith(".wav") || !existsSync(full)) return json(res, 404, { error: "没有这段音频。" });
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": statSync(full).size, "Cache-Control": "no-store" });
      return void createReadStream(full).pipe(res);
    }

    json(res, 404, { error: "没有这个地址。" });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    else res.end();
  }
});

// 只在本机监听：这个服务能启动配音进程、能往磁盘写文件，不该让局域网里的别人访问到
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Galley 视频工坊：http://localhost:${PORT}`);
  console.log(`  Galley：${GALLEY_URL}${galleyToken() ? "" : "（还没有接入密钥）"}`);
  console.log(`  配音服务：${TTS_SERVER}${ttsLaunch() ? "" : "（没有找到）"}`);
  console.log(`  音频存在：${WORK_DIR}`);
});

const shutdown = () => {
  void client?.then((c) => c.close()).catch(() => undefined);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
