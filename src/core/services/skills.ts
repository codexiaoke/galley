import { and, desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { agents, skillRevisions, skills, skillSuggestions } from "../db/schema";
import { forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";
import { describeComponents } from "../markup/components";

/**
 * 技能：下发给 Agent 的运营说明。Agent 连接后读取它们，就知道该怎样运营这个站。
 *
 * 程序自带一套默认技能，放在仓库的 skills/ 目录里。站长可以在后台修改它们，也可以新建：
 * 改过的和新建的存在数据库里，同名时以数据库里的为准。这样升级程序时默认技能可以跟着更新，
 * 站长自己改过的不会被覆盖。
 *
 * Agent 不能修改技能（技能决定了它自己的行为），只能提出修改建议，由站长决定。
 */

export type SkillSource = "default" | "modified" | "custom";

export type Skill = {
  name: string;
  description: string;
  /** 下发给 Agent 的正文，其中由程序生成的部分已经填好 */
  content: string;
  /** 站长编辑时看到的原文 */
  body: string;
  source: SkillSource;
  updatedAt: Date | null;
};

const SKILLS_DIR = path.join(process.cwd(), "skills");
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type DefaultSkill = { name: string; description: string; body: string };

function parseSkillFile(raw: string, fallbackName: string): DefaultSkill {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { name: meta.name ?? fallbackName, description: meta.description ?? "", body: (match?.[2] ?? raw).trim() };
}

/** 程序自带的默认技能。 */
function defaultSkills(): Map<string, DefaultSkill> {
  const result = new Map<string, DefaultSkill>();
  if (!fs.existsSync(SKILLS_DIR)) return result;
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    const file = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!entry.isDirectory() || !NAME_PATTERN.test(entry.name) || !fs.existsSync(file)) continue;
    const skill = parseSkillFile(fs.readFileSync(file, "utf8"), entry.name);
    result.set(entry.name, { ...skill, name: entry.name });
  }
  return result;
}

/** 技能里可以包含由程序生成的实时内容，保证和站点的实际状态一致。 */
function fillLiveContent(body: string): string {
  if (!body.includes("{{components}}")) return body;
  const components = describeComponents()
    .map(
      (c) =>
        `### ${c.name}\n\n${c.description}\n\n\`\`\`markdown\n${c.example}\n\`\`\`\n\n参数：\n\n\`\`\`json\n${JSON.stringify(c.params, null, 2)}\n\`\`\`` +
        ("details" in c && c.details ? `\n\n${c.details}` : ""),
    )
    .join("\n\n");
  return body.replace("{{components}}", components);
}

export function listSkills(db: Db): Omit<Skill, "content" | "body">[] {
  const defaults = defaultSkills();
  const stored = new Map(db.select().from(skills).all().map((row) => [row.name, row]));
  const names = [...new Set([...defaults.keys(), ...stored.keys()])].sort();
  return names.map((name) => {
    const row = stored.get(name);
    const base = defaults.get(name);
    return {
      name,
      description: row?.description ?? base?.description ?? "",
      source: row ? (base ? "modified" : "custom") : "default",
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export function getSkill(db: Db, name: string): Skill | undefined {
  // 技能名只允许小写字母、数字和连字符，避免被用来读取目录之外的文件。
  if (!NAME_PATTERN.test(name)) return undefined;
  const row = db.select().from(skills).where(eq(skills.name, name)).get();
  const base = defaultSkills().get(name);
  if (!row && !base) return undefined;
  const body = row?.body ?? base!.body;
  return {
    name,
    description: row?.description ?? base!.description,
    body,
    content: fillLiveContent(body),
    source: row ? (base ? "modified" : "custom") : "default",
    updatedAt: row?.updatedAt ?? null,
  };
}

/** 一个技能的默认版本（程序自带的那一份）。站长自己新建的技能没有默认版本。 */
export function getDefaultSkill(name: string): DefaultSkill | undefined {
  return NAME_PATTERN.test(name) ? defaultSkills().get(name) : undefined;
}

/** 站长修改一个技能，或者新建一个。每次保存留一个版本。 */
export function saveSkill(db: Db, actor: Actor, input: { name: string; description: string; body: string; note?: string }) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改技能。Agent 可以用 suggest_skill_change 提出修改建议。");
  const name = input.name.trim();
  if (!NAME_PATTERN.test(name)) throw invalid("技能名只能用小写字母、数字和连字符，例如 fact-check。");
  // 后台新建技能的网址用了 new 这个词，所以它不能当技能名。
  if (name === "new") throw invalid("new 不能用作技能名，换一个。");
  const body = input.body.trim();
  if (!body) throw invalid("技能的内容不能为空。");
  const description = input.description.trim();
  if (!description) throw invalid("请写一句说明：这个技能讲什么、什么时候读它。Agent 靠这句话决定要不要读。");
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(skills)
      .values({ name, description, body, updatedAt: now })
      .onConflictDoUpdate({ target: skills.name, set: { description, body, updatedAt: now } })
      .run();
    tx.insert(skillRevisions).values({ id: newId(), name, description, body, note: input.note?.trim() ?? "", createdAt: now }).run();
  });
  return getSkill(db, name)!;
}

/**
 * 丢掉站长的修改。程序自带的技能恢复成默认版本；站长自己新建的技能就此删除。
 * 历史版本保留，之后想找回来还能看到。
 */
export function resetSkill(db: Db, actor: Actor, name: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以恢复或删除技能。");
  const result = db.delete(skills).where(eq(skills.name, name)).run();
  if (result.changes === 0) throw notFound(`技能 ${name} 没有被修改过。`);
}

export function skillHistory(db: Db, name: string) {
  return db.select().from(skillRevisions).where(eq(skillRevisions.name, name)).orderBy(desc(skillRevisions.createdAt), desc(skillRevisions.id)).all();
}

/**
 * 把现在的全部技能导出成标准的技能文件夹（每个技能一个目录，里面一个 SKILL.md），
 * 给不通过 MCP 读技能的 Agent 产品手动安装用。导出的是下发给 Agent 的版本，程序生成的部分已经填好。
 */
export function exportSkillFiles(db: Db): { path: string; content: string }[] {
  return listSkills(db).map(({ name }) => {
    const skill = getSkill(db, name)!;
    return { path: `${name}/SKILL.md`, content: `---\nname: ${name}\ndescription: ${skill.description}\n---\n\n${skill.content.trim()}\n` };
  });
}

// ---- 修改建议 --------------------------------------------------------------

/** 一个 Agent 同时最多留这么多条还没处理的建议，避免刷屏。 */
const MAX_OPEN_SUGGESTIONS = 10;

/** Agent 提出一条修改建议：哪里应该改、为什么。建议不会改变技能，要等站长处理。 */
export function suggestSkillChange(db: Db, actor: Actor, input: { skill: string; suggestion: string; reason?: string }) {
  if (actor.kind !== "agent") throw forbidden("修改建议是给 Agent 用的。站长可以直接在后台修改技能。");
  if (!getSkill(db, input.skill)) {
    throw notFound(`技能 ${input.skill} 不存在。可用的技能：${listSkills(db).map((s) => s.name).join("、")}。`);
  }
  const suggestion = input.suggestion.trim();
  if (!suggestion) throw invalid("请写清楚建议改什么。");
  const open = db
    .select({ id: skillSuggestions.id })
    .from(skillSuggestions)
    .where(and(eq(skillSuggestions.agentId, actor.id), eq(skillSuggestions.status, "open")))
    .all().length;
  if (open >= MAX_OPEN_SUGGESTIONS) throw invalid(`你已经有 ${open} 条建议等站长处理了，先不要再提新的。`);
  const id = newId();
  db.insert(skillSuggestions)
    .values({ id, skillName: input.skill, suggestion, reason: input.reason?.trim() ?? "", agentId: actor.id, status: "open", createdAt: new Date() })
    .run();
  return { suggestionId: id, status: "open" as const };
}

export function listSkillSuggestions(db: Db, status: "open" | "done" | "dismissed" = "open") {
  return db
    .select({
      id: skillSuggestions.id,
      skillName: skillSuggestions.skillName,
      suggestion: skillSuggestions.suggestion,
      reason: skillSuggestions.reason,
      status: skillSuggestions.status,
      createdAt: skillSuggestions.createdAt,
      agentName: agents.name,
    })
    .from(skillSuggestions)
    .leftJoin(agents, eq(skillSuggestions.agentId, agents.id))
    .where(eq(skillSuggestions.status, status))
    .orderBy(desc(skillSuggestions.createdAt))
    .all();
}

/** 站长处理一条建议：已经照着改了（done），或者不采纳（dismissed）。 */
export function resolveSkillSuggestion(db: Db, actor: Actor, id: string, status: "done" | "dismissed") {
  if (actor.kind !== "owner") throw forbidden("只有站长可以处理修改建议。");
  const result = db.update(skillSuggestions).set({ status }).where(eq(skillSuggestions.id, id)).run();
  if (result.changes === 0) throw notFound("这条建议不存在。");
}
