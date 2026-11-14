import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { createTtsBridge } from "./tts-bridge";
import { StudioVoice } from "./voice";

async function main() {
  const directory = process.env.STUDIO_TTS_DIR ?? path.join(homedir(), ".galley-studio-tts");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, ".token");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 });
  // 配音传回容器后，宿主机不保留另一份成品；退出时清理临时工作区。
  const work = await mkdtemp(path.join(tmpdir(), "galley-tts-"));
  const voice = new StudioVoice(work, process.env.STUDIO_TTS_SERVER ?? "my-voice-tts");
  if (!voice.configured()) throw new Error("没有找到本机配音 MCP，请配置 STUDIO_TTS_COMMAND 或 ~/.claude.json。");
  const server = createTtsBridge(voice, readFileSync(file, "utf8").trim());
  const port = Number(process.env.STUDIO_TTS_PORT ?? 4322);
  server.listen(port, "127.0.0.1", () => console.log(`Studio 本机配音连接已启动：127.0.0.1:${port}`));
  const shutdown = () => {
    server.close();
    void voice.close().finally(async () => { await rm(work, { recursive: true, force: true }); process.exit(0); });
  };
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
