import { timingSafeEqual } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import type { StudioVoice } from "./voice";

const requestSchema = z.object({ text: z.string().trim().min(1).max(30000) }).strict();

/** 宿主机只提供配音与释放模型；不接受文件路径，不暴露本机 MCP 的其他工具。 */
export function createTtsBridge(voice: Pick<StudioVoice, "generate" | "file" | "unload">, token: string) {
  const expected = Buffer.from(`Bearer ${token}`);
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data));
  };
  return createServer(async (req, res) => {
    const auth = Buffer.from(req.headers.authorization ?? "");
    if (req.headers.origin || auth.length !== expected.length || !timingSafeEqual(auth, expected)) return json(res, 401, { error: "配音连接密钥无效。" });
    if (req.method === "GET" && req.url === "/healthz") return json(res, 200, { ok: true });
    if (req.method !== "POST" || !["/voice", "/unload"].includes(req.url ?? "")) return json(res, 404, { error: "没有这个地址。" });
    try {
      if (req.url === "/unload") { await voice.unload(); return json(res, 200, { ok: true }); }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > 128 * 1024) return json(res, 413, { error: "配音请求过大。" });
        chunks.push(chunk as Buffer);
      }
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json(res, 400, { error: "请求必须是 JSON。" }); }
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success) return json(res, 400, { error: "请提供有效讲稿，不要传入文件路径。" });
      // 容器负责内容缓存；显式重新生成时不能被宿主机缓存挡住。
      const result = await voice.generate("bridge", parsed.data.text, true, () => {});
      const file = voice.file(result.audio);
      let audio: string;
      try { audio = readFileSync(file).toString("base64"); }
      finally { for (const suffix of [".wav", ".srt", ".json"]) rmSync(file.replace(/\.wav$/, suffix), { force: true }); }
      json(res, 200, { duration_seconds: result.durationMs / 1000, subtitle_cues: result.cues, audio });
    } catch (error) { json(res, 500, { error: error instanceof Error ? error.message : "本机配音失败。" }); }
  });
}
