/** 只操作隔离实验工坊：容器 4431，或 --native 指定的本机 4441。 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { labFixture } from "./3d-lab-fixtures";

const native = process.argv.includes("--native");
const origin = `http://localhost:${native ? 4441 : 4431}`;
let cookie = "";
async function api(route: string, body?: unknown) {
  const response = await fetch(`${origin}/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: ${JSON.stringify(result)}`);
  const auth = response.headers.get("set-cookie");
  if (auth) cookie = auth.split(";")[0];
  return result;
}
async function main() {
  const lab = labFixture();
  const directory = `.lab/${lab.slug}`;
  const token = native ? readFileSync(".lab/native-studio/.owner-key", "utf8").trim()
    : execFileSync("docker", ["compose", "-f", "compose.3d-lab.yml", "exec", "-T", "studio", "cat", "/data/.owner-key"], { encoding: "utf8" }).trim();
  await api("session", { token });
  const existing: { id: string; revision: { source: { slug: string } } }[] = await api("projects");
  const found = existing.find((project) => project.revision.source.slug === lab.slug);
  if (found && !process.argv.includes("--sync")) throw new Error("该实验已有项目；来源更新后使用 --sync 同步并导出新版本。");
  let project = found ? await api(`projects/${found.id}`) : await api("projects", {slug:lab.slug,name:lab.name});
  if (found) project = await api(`projects/${found.id}/sync`, {revisionId:project.currentRevisionId});
  project = await api(`projects/${project.id}/revise`, {
    revisionId: project.currentRevisionId,
    edits: JSON.parse(readFileSync(`${directory}/narration.json`, "utf8")),
    note: "独立本地实验；使用 macOS Tingting 系统配音验证逐拍同步。",
  });
  const revisionId = project.currentRevisionId;
  await api(`projects/${project.id}/submit`, { revisionId, stage: "script" });
  await api(`projects/${project.id}/decide`, { revisionId, stage: "script", decision: "approve", note: "本地实验讲稿：用于验证 3D 动作与声音同步。" });
  await api(`projects/${project.id}/voices`, { revisionId });
  for (let i = 0; i < 30; i++) {
    const current = await api(`projects/${project.id}`);
    const state = current.revision.voiceJob;
    if (state.state === "failed") throw new Error(state.error);
    if (state.state === "idle") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const job = await api(`projects/${project.id}/render`, { revisionId, name: `${lab.title} · 3D 实验 4K` });
  const result = { projectId: project.id, revisionId, exportId: job.id, studio: origin };
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
void main();
