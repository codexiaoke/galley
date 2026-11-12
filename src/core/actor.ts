import type { ActorKind } from "./db/schema";

/**
 * 发起操作的身份。站长来自后台登录，Agent 来自 MCP 密钥。
 * 权限规则都在核心层按 Actor 判断，后台和 MCP 只是外壳。
 */
export type Actor = { kind: "owner" } | { kind: "agent"; id: string; name: string };

export const OWNER: Actor = { kind: "owner" };

export function actorColumns(actor: Actor): { kind: ActorKind; id: string | null } {
  return actor.kind === "owner" ? { kind: "owner", id: null } : { kind: "agent", id: actor.id };
}
