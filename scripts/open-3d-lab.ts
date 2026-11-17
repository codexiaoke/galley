import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const compose = fileURLToPath(new URL("../compose.3d-lab.yml", import.meta.url));
const native = process.argv.includes("--native");
const token = native ? readFileSync(new URL("../.lab/native-studio/.owner-key", import.meta.url), "utf8").trim()
  : execFileSync("docker", ["compose", "-f", compose, "exec", "-T", "studio", "cat", "/data/.owner-key"], { encoding: "utf8" }).trim();
// 实验统一用 127.0.0.1，避免覆盖原工坊 localhost 上的登录；两个实验工坊切换时重新登录。
const origin = `http://127.0.0.1:${native ? 4441 : 4431}`;
const child = spawn("open", [`${origin}/#session=${encodeURIComponent(token)}`], { stdio: "ignore" });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
