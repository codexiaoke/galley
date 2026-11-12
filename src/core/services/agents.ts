import { desc, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { agentCalls, agents } from "../db/schema";
import { forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * 接入一个 Agent。密钥只在这里返回一次，数据库里只保存它的校验值。
 * 只有站长能调用。
 */
export function createAgent(db: Db, actor: Actor, name: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以接入新的 Agent。");
  const trimmed = name.trim();
  if (!trimmed) throw invalid("Agent 需要一个名称。");
  const token = `gly_${randomBytes(24).toString("base64url")}`;
  const row = {
    id: newId(),
    name: trimmed,
    tokenHash: hashToken(token),
    disabled: false,
    lastSeenAt: null,
    createdAt: new Date(),
  };
  db.insert(agents).values(row).run();
  return { agent: { id: row.id, name: row.name }, token };
}

/** 用密钥换取身份。密钥无效或 Agent 已停用时返回 null。 */
export function authenticateAgent(db: Db, token: string): Extract<Actor, { kind: "agent" }> | null {
  if (!token.startsWith("gly_")) return null;
  const agent = db.select().from(agents).where(eq(agents.tokenHash, hashToken(token))).get();
  if (!agent || agent.disabled) return null;
  db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, agent.id)).run();
  return { kind: "agent", id: agent.id, name: agent.name };
}

export function listAgents(db: Db) {
  return db
    .select({
      id: agents.id,
      name: agents.name,
      disabled: agents.disabled,
      lastSeenAt: agents.lastSeenAt,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .orderBy(desc(agents.createdAt))
    .all();
}

export function setAgentDisabled(db: Db, actor: Actor, agentId: string, disabled: boolean) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以停用或启用 Agent。");
  db.update(agents).set({ disabled }).where(eq(agents.id, agentId)).run();
}

export function logAgentCall(db: Db, agentId: string, tool: string, error?: string) {
  db.insert(agentCalls)
    .values({ id: newId(), agentId, tool, ok: !error, error: error ?? null, createdAt: new Date() })
    .run();
}

export function recentAgentCalls(db: Db, limit = 30) {
  return db
    .select({
      id: agentCalls.id,
      agentName: agents.name,
      tool: agentCalls.tool,
      ok: agentCalls.ok,
      error: agentCalls.error,
      createdAt: agentCalls.createdAt,
    })
    .from(agentCalls)
    .innerJoin(agents, eq(agentCalls.agentId, agents.id))
    .orderBy(desc(agentCalls.createdAt))
    .limit(limit)
    .all();
}

/** 重新生成访问密钥。原来的密钥立即失效。只有站长可以。 */
export function regenerateAgentToken(db: Db, actor: Actor, agentId: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以重新生成密钥。");
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw notFound("Agent 不存在。");
  const token = `gly_${randomBytes(24).toString("base64url")}`;
  db.update(agents).set({ tokenHash: hashToken(token) }).where(eq(agents.id, agentId)).run();
  return { agent: { id: agent.id, name: agent.name }, token };
}
