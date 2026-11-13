import { and, desc, eq, inArray } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { agents, blockRevisions, blocks, changeSets, documentRevisions, documents, privateReads, type ChangeSetKind } from "../db/schema";
import { forbidden, notFound } from "../errors";

/**
 * 公开的运营日志：这个站上线过的每一项 Agent 的改动，做了什么、为什么（需求文档 5.9）。
 *
 * 日志里只有站长批准过的改动，内容是 Agent 开变更集时写的标题和说明，
 * 所以不需要另外审一遍。下面几种不出现在日志里：
 * - 站长自己的直接修改（日志记的是 Agent 做了什么）；
 * - 涉及私密知识块的改动，或者准备时读过私密知识块的改动：它的说明里可能带出私密的内容；
 * - 站长手动隐藏了的改动。
 */

export type LogEntry = {
  id: string;
  kind: ChangeSetKind;
  title: string;
  summary: string;
  agentName: string | null;
  decidedAt: Date;
  /** 被站长打回过几次才通过 */
  rejectCount: number;
  /** 没有经过审阅、由 Agent 直接上线的 */
  withoutReview: boolean;
  /** 这项改动上线或修改了哪些文章 */
  documents: { title: string; slug: string; kind: "article" | "page" }[];
  /** 整理或更新了几个知识块 */
  blockCount: number;
};

export function listOperationLog(db: Db, limit = 200): LogEntry[] {
  const rows = db
    .select({ cs: changeSets, agentName: agents.name })
    .from(changeSets)
    .leftJoin(agents, eq(changeSets.createdById, agents.id))
    .where(and(eq(changeSets.status, "approved"), eq(changeSets.createdByKind, "agent"), eq(changeSets.hiddenFromLog, false)))
    .orderBy(desc(changeSets.decidedAt))
    .limit(limit)
    .all();
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.cs.id);

  const touchedPrivate = new Set(
    db
      .selectDistinct({ id: blockRevisions.changeSetId })
      .from(blockRevisions)
      .innerJoin(blocks, eq(blockRevisions.blockId, blocks.id))
      .where(and(inArray(blockRevisions.changeSetId, ids), eq(blocks.visibility, "private")))
      .all()
      .map((r) => r.id),
  );
  for (const r of db.selectDistinct({ id: privateReads.changeSetId }).from(privateReads).where(inArray(privateReads.changeSetId, ids)).all()) {
    touchedPrivate.add(r.id);
  }

  const docs = db
    .select({ changeSetId: documentRevisions.changeSetId, title: documentRevisions.title, slug: documents.slug, kind: documents.kind, status: documents.status })
    .from(documentRevisions)
    .innerJoin(documents, eq(documentRevisions.documentId, documents.id))
    .where(inArray(documentRevisions.changeSetId, ids))
    .all();
  const blockCounts = new Map<string, number>();
  for (const r of db.select({ changeSetId: blockRevisions.changeSetId }).from(blockRevisions).where(inArray(blockRevisions.changeSetId, ids)).all()) {
    blockCounts.set(r.changeSetId!, (blockCounts.get(r.changeSetId!) ?? 0) + 1);
  }

  return rows
    .filter((r) => !touchedPrivate.has(r.cs.id))
    .map(({ cs, agentName }) => ({
      id: cs.id,
      kind: cs.kind,
      title: cs.title,
      summary: cs.summary,
      agentName,
      decidedAt: cs.decidedAt!,
      rejectCount: cs.rejectCount,
      withoutReview: cs.publishedWithoutReview,
      // 已经下线的文章不给链接，也不提它的标题。
      documents: docs.filter((d) => d.changeSetId === cs.id && d.status === "published").map((d) => ({ title: d.title, slug: d.slug, kind: d.kind })),
      blockCount: blockCounts.get(cs.id) ?? 0,
    }));
}

/** 站长把一项改动从运营日志里隐藏，或者恢复显示。 */
export function setHiddenFromLog(db: Db, actor: Actor, changeSetId: string, hidden: boolean) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以调整运营日志。");
  const result = db.update(changeSets).set({ hiddenFromLog: hidden }).where(eq(changeSets.id, changeSetId)).run();
  if (result.changes === 0) throw notFound(`变更集 ${changeSetId} 不存在。`);
}
