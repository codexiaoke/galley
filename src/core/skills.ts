import fs from "node:fs";
import path from "node:path";
import { describeComponents } from "./markup/components";

/**
 * 技能：下发给 Agent 的运营说明。
 * 骨架阶段从仓库的 skills/ 目录读取；之后改为存在数据库里，由站长在后台编辑。
 */
export type Skill = { name: string; description: string; content: string };

const SKILLS_DIR = path.join(process.cwd(), "skills");

function parseSkillFile(raw: string, fallbackName: string): Skill {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    name: meta.name ?? fallbackName,
    description: meta.description ?? "",
    content: (match?.[2] ?? raw).trim(),
  };
}

/** 技能里可以包含由程序生成的实时内容，保证和站点的实际状态一致。 */
function fillLiveContent(content: string): string {
  if (!content.includes("{{components}}")) return content;
  const components = describeComponents()
    .map((c) => `### ${c.name}\n\n${c.description}\n\n\`\`\`markdown\n${c.example}\n\`\`\`\n\n参数：\n\n\`\`\`json\n${JSON.stringify(c.params, null, 2)}\n\`\`\``)
    .join("\n\n");
  return content.replace("{{components}}", components);
}

export function listSkills(): Pick<Skill, "name" | "description">[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, entry.name, "SKILL.md")))
    .map((entry) => {
      const skill = parseSkillFile(fs.readFileSync(path.join(SKILLS_DIR, entry.name, "SKILL.md"), "utf8"), entry.name);
      return { name: skill.name, description: skill.description };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSkill(name: string): Skill | undefined {
  // 技能名只允许小写字母、数字和连字符，避免被用来读取目录之外的文件。
  if (!/^[a-z0-9-]+$/.test(name)) return undefined;
  const file = path.join(SKILLS_DIR, name, "SKILL.md");
  if (!fs.existsSync(file)) return undefined;
  const skill = parseSkillFile(fs.readFileSync(file, "utf8"), name);
  return { ...skill, content: fillLiveContent(skill.content) };
}
