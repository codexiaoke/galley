import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { OWNER } from "../actor";
import { openDb } from "../db/client";
import { codexPluginArchive, codexPluginFiles, MARKETPLACE_NAME, PLUGIN_NAME } from "../plugin";
import { exportSkillFiles, saveSkill } from "../services/skills";
import { unpackTar } from "../tar";

const options = { mcpUrl: "https://blog.example.com/mcp", siteName: "程序员小柯" };

describe("Codex 插件", () => {
  it("市场、清单、MCP 配置和技能都在，地址填的是本站", () => {
    const files = new Map(codexPluginFiles(options).map((f) => [f.path, f.content]));
    const marketplace = JSON.parse(files.get(".agents/plugins/marketplace.json")!);
    expect(marketplace.name).toBe(MARKETPLACE_NAME);
    expect(marketplace.plugins[0].source).toEqual({ source: "local", path: `./plugins/${PLUGIN_NAME}` });

    const manifest = JSON.parse(files.get(`plugins/${PLUGIN_NAME}/.codex-plugin/plugin.json`)!);
    expect(manifest).toMatchObject({ name: PLUGIN_NAME, skills: "./skills/", mcpServers: "./.mcp.json" });
    expect(manifest.interface.displayName).toBe("程序员小柯");

    const mcp = JSON.parse(files.get(`plugins/${PLUGIN_NAME}/.mcp.json`)!);
    expect(mcp.mcpServers.galley).toEqual({ url: "https://blog.example.com/mcp", bearer_token_env_var: "GALLEY_TOKEN", default_tools_approval_mode: "approve" });

    for (const name of ["galley-start", "galley-run", "galley-note"]) {
      const skill = files.get(`plugins/${PLUGIN_NAME}/skills/${name}/SKILL.md`)!;
      expect(skill).toMatch(new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n---\\n`));
    }
  });

  it("插件里不带访问密钥", () => {
    const all = codexPluginFiles(options).map((f) => f.content).join("\n");
    expect(all).not.toMatch(/gly_[A-Za-z0-9_-]{8,}/);
    expect(all).not.toMatch(/"bearer_token"\s*:/);
  });

  it("压缩包解开是一个目录", () => {
    const { archive } = codexPluginArchive(options);
    const names = unpackTar(gunzipSync(archive)).map((e) => e.name);
    expect(names.every((n) => n.startsWith("galley-codex-plugin/"))).toBe(true);
    expect(names).toContain("galley-codex-plugin/.agents/plugins/marketplace.json");
  });

  it("仓库里的通用插件和生成的一致（改了生成规则要运行 pnpm codex-plugin）", () => {
    const root = path.join(process.cwd(), "integrations", "codex");
    for (const file of codexPluginFiles({ mcpUrl: "http://localhost:3000/mcp", siteName: "我的博客" })) {
      expect(fs.readFileSync(path.join(root, file.path), "utf8"), file.path).toBe(file.content);
    }
  });
});

describe("导出技能文件夹", () => {
  it("每个技能一个目录，导出的是下发给 Agent 的版本", () => {
    const db = openDb(":memory:");
    saveSkill(db, OWNER, { name: "fact-check", description: "核实事实", body: "每个数字都要有来源。" });
    const files = new Map(exportSkillFiles(db).map((f) => [f.path, f.content]));
    expect(files.get("fact-check/SKILL.md")).toBe("---\nname: fact-check\ndescription: 核实事实\n---\n\n每个数字都要有来源。\n");
    expect(files.get("writing/SKILL.md")).not.toContain("{{components}}");
    expect([...files.keys()]).toEqual(expect.arrayContaining(["overview/SKILL.md", "materials/SKILL.md"]));
  });
});
