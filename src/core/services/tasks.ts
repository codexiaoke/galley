import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { listChangeSets } from "./changeSets";
import { countOpenComments } from "./comments";
import { listStaleCitations } from "./documents";
import { listMaterials } from "./materials";
import { listTopics } from "./topics";

/**
 * Agent 每次运行先问"现在该做什么"。按优先级返回：
 * 1. 被打回、等待修改的变更集；
 * 2. 过期的依据引用，需要修订；
 * 3. 自己还没提交的变更集；
 * 4. 素材箱里还没处理的素材；
 * 5. 站长已经采纳、可以开写的选题。
 */
export function getNextTasks(db: Db, actor: Actor) {
  const agentId = actor.kind === "agent" ? actor.id : undefined;
  const mine = (status: "rejected" | "open" | "in_review") =>
    listChangeSets(db, { status: [status], agentId }).map((cs) => ({
      changeSetId: cs.id,
      kind: cs.kind,
      title: cs.title,
      note: cs.decisionNote,
      // 站长在具体文字上写的、还没回复的批注数量。内容用 get_change_set 读取。
      ...(status === "rejected" ? { openComments: countOpenComments(db, cs.id) } : {}),
    }));

  // 已经有修订在路上的文档不算待办，否则 Agent 提交修订之后下一轮还会再处理一遍。
  type StaleDoc = { documentId: string; slug: string; title: string; citations: unknown[] };
  const staleByDocument = new Map<string, StaleDoc>();
  const revisionsInProgress = new Map<string, { documentId: string; slug: string; title: string; changeSetId: string; status: string }>();
  for (const c of listStaleCitations(db)) {
    if (c.pendingRevision) {
      revisionsInProgress.set(c.documentId, { documentId: c.documentId, slug: c.slug, title: c.documentTitle, ...c.pendingRevision });
      continue;
    }
    const entry = staleByDocument.get(c.documentId) ?? { documentId: c.documentId, slug: c.slug, title: c.documentTitle, citations: [] };
    entry.citations.push({ blockId: c.blockId, spanText: c.spanText, reason: c.reason, staleReason: c.staleReason });
    staleByDocument.set(c.documentId, entry);
  }

  return {
    rejected: mine("rejected"),
    staleCitations: [...staleByDocument.values()],
    /** 过期引用里已经提交了修订、正在等结论的文档。仅供知悉，不需要再处理 */
    staleCitationsBeingRevised: [...revisionsInProgress.values()],
    unfinished: mine("open"),
    /** 素材箱里还没处理的素材，旧的在前 */
    materials: listMaterials(db, { status: ["new"] })
      .reverse()
      .map((m) => ({ materialId: m.id, content: m.content, url: m.url, isPrivate: m.isPrivate, createdAt: m.createdAt })),
    /** 站长已经采纳、可以开写的选题，优先级高的在前。一轮只写一篇 */
    topics: listTopics(db, { status: ["accepted"] }).map((t) => ({ topicId: t.id, title: t.title, note: t.note, priority: t.priority })),
    /** 你提出的、还在等站长决定的候选选题数量。仅供知悉：候选太多时不要再提新的 */
    proposedTopicsWaiting: listTopics(db, { status: ["proposed"] }).length,
    waitingForReview: mine("in_review"),
  };
}
