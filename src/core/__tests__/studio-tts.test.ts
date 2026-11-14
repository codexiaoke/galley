import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTtsBridge } from "../../../integrations/video-studio/tts-bridge";
import { StudioVoice } from "../../../integrations/video-studio/voice";
import { studioFetchUrl } from "../../../integrations/video-studio/site-url";

let dir: string, server: Server;
let url: string;
const audio = Buffer.from("RIFF0000WAVEfmt test audio");
const generate = vi.fn();
const unload = vi.fn();
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "studio-tts-test-"));
  writeFileSync(path.join(dir, "token"), "bridge-secret");
  generate.mockImplementation(async () => {
    writeFileSync(path.join(dir, "voice.wav"), audio);
    return { id: "bridge", audio: "/audio/voice.wav", durationMs: 1000, cues: [{ start: 0, end: 1, text: "你好" }] };
  });
  server = createTtsBridge({ generate, unload, file: () => path.join(dir, "voice.wav") }, "bridge-secret");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  rmSync(dir, { recursive: true, force: true }); vi.clearAllMocks(); vi.unstubAllEnvs();
});
it("宿主机拒绝无密钥、浏览器跨站和客户端指定输出路径", async () => {
  expect((await fetch(`${url}/healthz`)).status).toBe(401);
  expect((await fetch(`${url}/healthz`, { headers: { Authorization: "Bearer bridge-secret", Origin: "https://other.example" } })).status).toBe(401);
  const response = await fetch(`${url}/voice`, { method: "POST", headers: { Authorization: "Bearer bridge-secret" }, body: JSON.stringify({ text: "你好", output_path: "/tmp/should-not-write.wav" }) });
  expect(response.status).toBe(400); expect(generate).not.toHaveBeenCalled();
});
it("容器收到 WAV 后保存到自己的目录，缓存复用且强制重做会再次调用宿主机", async () => {
  const voice = new StudioVoice(path.join(dir, "container"), "test-voice", { url, tokenFile: path.join(dir, "token") });
  const first = await voice.generate("beat1", "你好", false, () => {});
  expect(readFileSync(voice.file(first.audio))).toEqual(audio);
  expect(first.durationMs).toBe(1000); expect(first.cues[0].text).toBe("你好");
  expect((await voice.generate("beat2", "你好", false, () => {})).audio).toBe(first.audio);
  const again = await voice.generate("beat1", "你好", true, () => {});
  expect(again.audio).not.toBe(first.audio); expect(generate).toHaveBeenCalledTimes(2);
  await voice.unload(); expect(unload).toHaveBeenCalledOnce();
});
it("密钥错误不会生成声音或写入缓存", async () => {
  writeFileSync(path.join(dir, "token"), "wrong-token");
  const voice = new StudioVoice(dir, "test", { url, tokenFile: path.join(dir, "token") });
  await expect(voice.generate("beat", "你好", false, () => {})).rejects.toThrow("密钥无效");
  expect(generate).not.toHaveBeenCalled();
});
it("模型失败不会被缓存，修复后的配音可以继续生成", async () => {
  generate.mockRejectedValueOnce(new Error("模型未就绪"));
  const voice = new StudioVoice(dir, "test", { url, tokenFile: path.join(dir, "token") });
  await expect(voice.generate("beat", "你好", false, () => {})).rejects.toThrow("模型未就绪");
  const recovered = await voice.generate("beat", "你好", false, () => {});
  expect(readFileSync(voice.file(recovered.audio))).toEqual(audio);
  expect(generate).toHaveBeenCalledTimes(2);
});
it("只替换后端请求中的本机主机名，保留站点端口、路径和线上地址", () => {
  vi.stubEnv("STUDIO_LOCAL_SITE_HOST", "host.docker.internal");
  expect(studioFetchUrl("http://localhost:3222/posts/demo/present?version=abc")).toBe("http://host.docker.internal:3222/posts/demo/present?version=abc");
  expect(studioFetchUrl("http://127.0.0.1:3000/narration.json")).toBe("http://host.docker.internal:3000/narration.json");
  expect(studioFetchUrl("https://blog.example.com/narration.json")).toBe("https://blog.example.com/narration.json");
});
