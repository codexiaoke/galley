import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { listChangeSets } from "./changeSets";
import { listStaleCitations } from "./documents";

/**
 * Agent 每次运行先问"现在该做什么"。按优先级返回：
 * 1. 被打回、等待修改的变更集；
 * 2. 过期的依据引用，需要修订；
 * 3. 自己还没提交的变更集。
 * 素材和选题接入后，在这里继续追加。
 */
export function getNextTasks(db: Db, actor: Actor) {
  const agentId = actor.kind === "agent" ? actor.id : undefined;
  const mine = (status: "rejected" | "open" | "in_review") =>
    listChangeSets(db, { status: [status], agentId }).map((cs) => ({
      changeSetId: cs.id,
      kind: cs.kind,
      title: cs.title,
      note: cs.decisionNote,
    }));

  const staleByDocument = new Map<string, { documentId: string; slug: string; title: string; citations: unknown[] }>();
  for (const c of listStaleCitations(db)) {
    const entry = staleByDocument.get(c.documentId) ?? {
      documentId: c.documentId,
      slug: c.slug,
      title: c.documentTitle,
      citations: [],
    };
    entry.citations.push({ blockId: c.blockId, spanText: c.spanText, reason: c.reason });
    staleByDocument.set(c.documentId, entry);
  }

  return {
    rejected: mine("rejected"),
    staleCitations: [...staleByDocument.values()],
    unfinished: mine("open"),
    waitingForReview: mine("in_review"),
  };
}
