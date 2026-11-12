import { and, asc, eq } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { blockRevisions, documentRevisions, documents, reviewComments } from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";
import { assertOwnership, findChangeSet } from "./changeSets";

/**
 * 审阅批注（设计文档第 7 节）。
 *
 * 站长在待审内容的某段文字上写意见；打回之后 Agent 逐条修改、逐条回复；
 * 还有没回复的批注时，变更集不能重新提交（这条规则在 submitChangeSet 里）。
 */

export type ReviewComment = typeof reviewComments.$inferSelect;

/** 定位信息里前后文最多保留的字数。 */
const CONTEXT = 32;

type CommentTarget = { type: "document"; documentId: string; title: string } | { type: "block"; blockId: string; title: string };

function targetOf(db: Db, comment: Pick<ReviewComment, "targetType" | "targetRevisionId">): CommentTarget | undefined {
  if (comment.targetType === "document") {
    const row = db
      .select({ documentId: documents.id, title: documentRevisions.title })
      .from(documentRevisions)
      .innerJoin(documents, eq(documentRevisions.documentId, documents.id))
      .where(eq(documentRevisions.id, comment.targetRevisionId))
      .get();
    return row && { type: "document", ...row };
  }
  const row = db
    .select({ blockId: blockRevisions.blockId, title: blockRevisions.title })
    .from(blockRevisions)
    .where(eq(blockRevisions.id, comment.targetRevisionId))
    .get();
  return row && { type: "block", ...row };
}

/** 站长在待审（或已打回）的变更集里，对某个版本的一段文字写批注。 */
export function addComment(
  db: Db,
  actor: Actor,
  input: {
    changeSetId: string;
    targetType: "document" | "block";
    targetRevisionId: string;
    /** 被批注的原文。不给表示批注针对整篇内容 */
    quote?: string;
    prefix?: string;
    suffix?: string;
    body: string;
  },
): ReviewComment {
  if (actor.kind !== "owner") throw forbidden("只有站长可以写批注。");
  const body = input.body.trim();
  if (!body) throw invalid("批注的内容不能为空。");
  const cs = findChangeSet(db, input.changeSetId);
  if (cs.status !== "in_review" && cs.status !== "rejected") {
    throw conflict("只有待审或已打回的改动可以写批注。");
  }
  const revisions = input.targetType === "document" ? documentRevisions : blockRevisions;
  const revision = db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(eq(revisions.id, input.targetRevisionId), eq(revisions.changeSetId, input.changeSetId)))
    .get();
  if (!revision) throw notFound("要批注的内容不在这个改动里。");

  const quote = input.quote?.trim();
  const row: ReviewComment = {
    id: newId(),
    changeSetId: input.changeSetId,
    targetType: input.targetType,
    targetRevisionId: input.targetRevisionId,
    anchor: quote ? { exact: quote, prefix: input.prefix?.slice(-CONTEXT), suffix: input.suffix?.slice(0, CONTEXT) } : null,
    body,
    status: "open",
    reply: null,
    createdAt: new Date(),
  };
  db.insert(reviewComments).values(row).run();
  return row;
}

/**
 * 估计一条批注落在正文源码的第几行，帮 Agent 找位置。
 *
 * 批注记下的是页面上显示的文字，不含标记；源码里同一段话中间可能夹着 :cite[...]{...} 这样的标记，
 * 所以不能直接整段查找。做法是把每一行还原成大致的显示文字（去掉标记和空白），
 * 再拿批注去找；整段找不到就退而用开头的一小段。只在恰好找到一处时才给出行号。
 */
export function lineOfQuote(source: string, quote: string): number | undefined {
  const squash = (text: string) => text.replace(/\s+/g, "");
  const needle = squash(quote);
  if (!needle) return undefined;
  /** 把一行源码还原成大致的显示文字：去掉引用标记的外壳、链接的地址和 Markdown 的符号。 */
  const visible = (line: string) =>
    line
      .replace(/:{1,3}[a-z]+\[/gi, "")
      .replace(/\]\{[^}]*\}/g, "")
      .replace(/:{1,3}[a-z]+\{[^}]*\}/gi, "")
      .replace(/\]\([^)]*\)/g, "")
      .replace(/[*_`#>[\]]/g, "");
  const lines = source.split("\n").map(visible);
  for (const size of [needle.length, 24, 12, 6]) {
    if (size > needle.length) continue;
    const head = needle.slice(0, size);
    const hits = lines.flatMap((line, i) => (squash(line).includes(head) ? [i + 1] : []));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return undefined;
  }
  return undefined;
}

/** 一个变更集里的全部批注，按写下的先后排列，附带它针对的是哪篇文档或哪个知识块。 */
export function listComments(db: Db, changeSetId: string) {
  return db
    .select()
    .from(reviewComments)
    .where(eq(reviewComments.changeSetId, changeSetId))
    .orderBy(asc(reviewComments.createdAt), asc(reviewComments.id))
    .all()
    .map((comment) => ({ ...comment, target: targetOf(db, comment) }));
}

export function countOpenComments(db: Db, changeSetId: string): number {
  return db
    .select({ id: reviewComments.id })
    .from(reviewComments)
    .where(and(eq(reviewComments.changeSetId, changeSetId), eq(reviewComments.status, "open")))
    .all().length;
}

function requireComment(db: Db, id: string): ReviewComment {
  const comment = db.select().from(reviewComments).where(eq(reviewComments.id, id)).get();
  if (!comment) throw notFound(`批注 ${id} 不存在。`);
  return comment;
}

/** Agent 回复一条批注：说明怎么处理的，批注随之标为已处理。 */
export function replyToComment(db: Db, actor: Actor, id: string, reply: string) {
  const comment = requireComment(db, id);
  assertOwnership(actor, findChangeSet(db, comment.changeSetId));
  const text = reply.trim();
  if (!text) throw invalid("请写一句回复，说明这条批注是怎么处理的。");
  db.update(reviewComments).set({ reply: text, status: "resolved" }).where(eq(reviewComments.id, id)).run();
  return { commentId: id, status: "resolved" as const, openComments: countOpenComments(db, comment.changeSetId) };
}

/** 站长觉得没改到位，重新打开一条批注。之前的回复保留，方便对照。 */
export function reopenComment(db: Db, actor: Actor, id: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以重新打开批注。");
  requireComment(db, id);
  db.update(reviewComments).set({ status: "open" }).where(eq(reviewComments.id, id)).run();
}

/** 站长自己把一条批注标为已处理（比如自己动手改掉了）。 */
export function resolveComment(db: Db, actor: Actor, id: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以直接关闭批注。Agent 请用回复来处理批注。");
  requireComment(db, id);
  db.update(reviewComments).set({ status: "resolved" }).where(eq(reviewComments.id, id)).run();
}

export function deleteComment(db: Db, actor: Actor, id: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以删除批注。");
  requireComment(db, id);
  db.delete(reviewComments).where(eq(reviewComments.id, id)).run();
}
