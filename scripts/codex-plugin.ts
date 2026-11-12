/**
 * 生成仓库里那份通用的 Codex 插件（integrations/codex），站点地址用占位的 localhost。
 * 修改了 src/core/plugin.ts 之后运行：pnpm codex-plugin
 *
 * 每个站点的后台也能下载一份填好了本站地址的，内容由同一个函数生成。
 */
import fs from "node:fs";
import path from "node:path";
import { codexPluginFiles } from "../src/core/plugin";

export const GENERIC = { mcpUrl: "http://localhost:3000/mcp", siteName: "我的博客" };
const root = path.join(process.cwd(), "integrations", "codex");

fs.rmSync(root, { recursive: true, force: true });
for (const file of codexPluginFiles(GENERIC)) {
  const target = path.join(root, file.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.content);
}
console.log(`已生成 ${path.relative(process.cwd(), root)}`);
