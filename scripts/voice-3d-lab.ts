/** 实验专用 macOS 系统配音，输出到 .lab/voice-assets，供独立工坊按正常流程复用。 */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { labFixture } from "./3d-lab-fixtures";
function duration(file: string) {
  const wav = readFileSync(file);
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("系统配音没有生成 WAV");
  let byteRate = 0, bytes = 0;
  for (let at = 12; at + 8 <= wav.length;) {
    const name = wav.toString("ascii", at, at + 4), length = wav.readUInt32LE(at + 4);
    if (name === "fmt ") byteRate = wav.readUInt32LE(at + 16);
    if (name === "data") bytes = length;
    at += 8 + length + length % 2;
  }
  if (!byteRate || !bytes) throw new Error("WAV 缺少时长信息");
  return bytes / byteRate;
}
async function main() {
  const lab = labFixture();
  const narration = lab.narration;
  const response = await fetch(`http://localhost:3431/posts/${lab.slug}/structure.json`);
  if (!response.ok) throw new Error(`读取实验文章失败：${response.status}`);
  const source = await response.json() as { beats: { id: string; kind: string }[] };
  const beats = source.beats.filter((beat) => beat.kind === "step");
  if (beats.length !== narration.length) throw new Error("实验拍点数与讲稿不符");
  const directory = path.join(process.cwd(), ".lab/voice-assets");
  mkdirSync(directory, { recursive: true });
  const edits = [];
  for (const [i, beat] of beats.entries()) {
    const text = narration[i], audio = `${randomUUID()}.wav`, file = path.join(directory, audio);
    const input = path.join(directory, `speech-${i}.txt`);
    writeFileSync(input, text);
    execFileSync("say", ["-v", "Tingting", "-r", "205", "-f", input, "-o", file, "--file-format=WAVE", "--data-format=LEI16@24000"]);
    const seconds = duration(file);
    const hash = createHash("sha256").update(text).digest("hex");
    const cache = createHash("sha256").update(`lab-system-voice\n${text}`).digest("hex");
    writeFileSync(path.join(directory, `${cache}.json`), JSON.stringify({
      id: beat.id, hash, audio: `/audio/${audio}`, durationMs: Math.round(seconds * 1000),
      cues: [{ start: 0, end: seconds, text }],
    }));
    edits.push({ id: beat.id, text });
    console.log(`${beat.id}: ${seconds.toFixed(2)} 秒`);
  }
  const output = path.join(process.cwd(), ".lab", lab.slug);
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, "narration.json"), JSON.stringify(edits, null, 2));
}
void main();
