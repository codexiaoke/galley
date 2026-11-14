/** 本机 Docker 部署入口。Mac 的 MLX 配音保留宿主机执行，launchd 管理其生命周期。 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const action = process.argv[2] ?? "up";
const directory = process.env.STUDIO_TTS_DIR ?? path.join(homedir(), ".galley-studio-tts");
const label = "com.galley.studio.tts";
const domain = `gui/${process.getuid?.()}`;
const plist = path.join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const env = { ...process.env, STUDIO_TTS_URL: `http://host.docker.internal:${process.env.STUDIO_TTS_PORT ?? 4322}` };
const compose = ["compose", "-f", path.join(root, "compose.studio.yml")];

function run(command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, { cwd: root, env, input, stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 执行失败（${result.status}）。`);
}

async function startBridge() {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  mkdirSync(path.dirname(plist), { recursive: true });
  const escape = (value: string) => value.replace(/[<>&"']/g, (s) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[s]!);
  const values: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", STUDIO_TTS_DIR: directory };
  for (const name of ["STUDIO_TTS_PORT", "STUDIO_TTS_SERVER", "STUDIO_TTS_COMMAND"]) if (process.env[name]) values[name] = process.env[name]!;
  const settings = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${[process.execPath, "--import", "tsx", path.join(root, "integrations/video-studio/tts-server.ts")].map((value) => `<string>${escape(value)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${escape(root)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(values).map(([key, value]) => `<key>${key}</key><string>${escape(value)}</string>`).join("")}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${escape(path.join(directory, "service.log"))}</string>
<key>StandardErrorPath</key><string>${escape(path.join(directory, "service.log"))}</string>
</dict></plist>\n`;
  const loaded = spawnSync("launchctl", ["print", `${domain}/${label}`], { stdio: "ignore" }).status === 0;
  const changed = !existsSync(plist) || readFileSync(plist, "utf8") !== settings;
  if (loaded && !changed) {
    // 更新源码也要重启；kickstart 避免重复卸载、注册同一个服务。
    run("launchctl", ["kickstart", "-k", `${domain}/${label}`]);
  } else {
    if (loaded) run("launchctl", ["bootout", `${domain}/${label}`]);
    if (changed) writeFileSync(plist, settings, { mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      const result = spawnSync("launchctl", ["bootstrap", domain, plist], { encoding: "utf8" });
      if (result.error) throw result.error;
      if (result.status === 0) break;
      // bootout 异步释放旧服务，紧接着 bootstrap 会短暂返回 5；只对这一情形等待。
      if (!loaded || result.status !== 5 || attempt === 20) throw new Error(`配音服务注册失败：${result.stderr.trim()}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    const file = path.join(directory, ".token");
    if (existsSync(file)) {
      try {
        const response = await fetch(`http://127.0.0.1:${process.env.STUDIO_TTS_PORT ?? 4322}/healthz`, {
          headers: { Authorization: `Bearer ${readFileSync(file, "utf8").trim()}` }, signal: AbortSignal.timeout(1000),
        });
        if (response.ok) return;
      } catch { /* launchd 仍在启动；超时后报告日志位置。 */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`本机配音未能启动，请查看 ${path.join(directory, "service.log")}。`);
}

async function main() {
  if (["help", "--help", "-h"].includes(action)) {
    console.log(`Galley 本机视频工坊

用法：pnpm studio:docker [up|open|status|logs|stop|help]
  up      构建并启动本机 Docker 工坊，配置 Mac 配音连接（默认）
  open    在浏览器登录工坊
  status  查看容器与 Mac 配音连接的运行状态
  logs    跟随容器日志
  stop    停止工坊和本次登录的配音连接，保留数据卷

先准备 Docker、Node 22、pnpm 和本机配音 MCP。
配音配置：integrations/video-studio/voice-setup.md
部署、迁移与备份：integrations/video-studio/README.md
自定义端口时，每条命令使用相同的 STUDIO_PORT。`);
  } else if (action === "up") {
    if (process.platform !== "darwin") throw new Error("自动配置配音目前用于 macOS；其他系统请按 integrations/video-studio/README.md 手动部署。");
    run("docker", [...compose, "build"]);
    await startBridge();
    // 临时容器把连接密钥写进同一数据卷，不出现在命令参数、日志或 Compose 环境里。
    run("docker", [...compose, "run", "--rm", "-T", "--no-deps", "studio", "node", "-e", "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>require('node:fs').writeFileSync('/data/.tts-token',s,{mode:0o600}))"], readFileSync(path.join(directory, ".token"), "utf8"));
    run("docker", [...compose, "up", "-d", "--wait"]);
    console.log(`Studio 已启动：http://localhost:${process.env.STUDIO_PORT ?? 4321}。运行 pnpm studio:docker open 登录。`);
  } else if (action === "open") {
    const key = spawnSync("docker", [...compose, "exec", "-T", "studio", "cat", "/data/.owner-key"], { cwd: root, env, encoding: "utf8" });
    if (key.status !== 0 || !key.stdout.trim()) throw new Error("请先启动 Docker Studio。");
    const url = `http://localhost:${process.env.STUDIO_PORT ?? 4321}/#session=${encodeURIComponent(key.stdout.trim())}`;
    run(process.platform === "darwin" ? "open" : "xdg-open", [url]);
  } else if (action === "stop") {
    run("docker", [...compose, "down"]);
    if (process.platform === "darwin" && spawnSync("launchctl", ["print", `${domain}/${label}`], { stdio: "ignore" }).status === 0) run("launchctl", ["bootout", `${domain}/${label}`]);
  } else if (action === "status") {
    run("docker", [...compose, "ps", "--all"]);
    if (process.platform === "darwin") {
      const service = spawnSync("launchctl", ["print", `${domain}/${label}`], { encoding: "utf8" });
      if (service.error) throw service.error;
      const state = service.status === 0 ? /^\s*state = (.+)$/m.exec(service.stdout)?.[1] ?? "已注册" : "未运行";
      console.log(`Mac 配音连接：${state}；日志：${path.join(directory, "service.log")}`);
    }
  } else if (action === "logs") run("docker", [...compose, "logs", "--tail", "100", "-f"]);
  else throw new Error("用法：pnpm studio:docker [up|open|status|logs|stop|help]");
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
