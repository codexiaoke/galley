import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { actorColumns, type Actor } from "../actor";
import type { Db } from "../db/client";
import {
  blockRevisions,
  blocks,
  changeSets,
  documentRevisions,
  documents,
  privateReads,
  refs,
  reviewComments,
  topics,
  type ChangeSetKind,
  type ChangeSetStatus,
} from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";

export type ChangeSet = typeof changeSets.$inferSelect;

/** 这些状态下的变更集仍然占用着它修改的对象。 */
const ACTIVE: ChangeSetStatus[] = ["open", "in_review", "rejected"];
/** 这些状态下创建者可以继续修改内容。 */
const EDITABLE: ChangeSetStatus[] = ["open", "rejected"];
/** 站长还可以在待审时直接改：看到小问题自己改掉再批准，不必打回（设计文档 5.2 第 3 条）。 */
const EDITABLE_BY_OWNER: ChangeSetStatus[] = [...EDITABLE, "in_review"];

export function openChangeSet(
  db: Db,
  actor: Actor,
  input: { kind: ChangeSetKind; title: string; summary?: string; topicId?: string },
): ChangeSet {
  const title = input.title.trim();
  if (!title) throw invalid("变更集需要一个标题，说明这次要做什么。");
  const who = actorColumns(actor);
  const row = {
    id: newId(),
    kind: input.kind,
    title,
    summary: input.summary?.trim() ?? "",
    status: "open" as const,
    createdByKind: who.kind,
    createdById: who.id,
    topicId: input.topicId ?? null,
    decisionNote: null,
    createdAt: new Date(),
    submittedAt: null,
    decidedAt: null,
  };
  db.insert(changeSets).values(row).run();
  return row;
}

export function findChangeSet(db: Db, id: string): ChangeSet {
  const row = db.select().from(changeSets).where(eq(changeSets.id, id)).get();
  if (!row) throw notFound(`变更集 ${id} 不存在。`);
  return row;
}

/** Agent 只能操作自己创建的变更集；站长可以操作任何变更集。 */
export function assertOwnership(actor: Actor, cs: ChangeSet) {
  if (actor.kind === "owner") return;
  if (cs.createdByKind !== "agent" || cs.createdById !== actor.id) {
    throw forbidden(`变更集 ${cs.id} 不是你创建的，不能操作。`);
  }
}

/** 取出一个当前可以修改的变更集，否则抛错。 */
export function requireEditable(db: Db, actor: Actor, id: string): ChangeSet {
  const cs = findChangeSet(db, id);
  assertOwnership(actor, cs);
  if (!(actor.kind === "owner" ? EDITABLE_BY_OWNER : EDITABLE).includes(cs.status)) {
    throw conflict(`变更集 ${id} 的状态是 ${cs.status}，不能再修改。只有 open 和 rejected 状态可以修改。`);
  }
  return cs;
}

/**
 * 同一个对象同时只能在一个未结束的变更集里（设计文档 5.2 第 4 条）。
 * 这样不需要处理合并冲突。
 */
export function assertNotLockedElsewhere(
  db: Db,
  changeSetId: string,
  target: { blockId: string } | { documentId: string },
) {
  const other =
    "blockId" in target
      ? db
          .select({ id: changeSets.id, title: changeSets.title })
          .from(blockRevisions)
          .innerJoin(changeSets, eq(blockRevisions.changeSetId, changeSets.id))
          .where(
            and(
              eq(blockRevisions.blockId, target.blockId),
              eq(blockRevisions.state, "draft"),
              ne(changeSets.id, changeSetId),
              inArray(changeSets.status, ACTIVE),
            ),
          )
          .get()
      : db
          .select({ id: changeSets.id, title: changeSets.title })
          .from(documentRevisions)
          .innerJoin(changeSets, eq(documentRevisions.changeSetId, changeSets.id))
          .where(
            and(
              eq(documentRevisions.documentId, target.documentId),
              eq(documentRevisions.state, "draft"),
              ne(changeSets.id, changeSetId),
              inArray(changeSets.status, ACTIVE),
            ),
          )
          .get();
  if (other) {
    const what = "blockId" in target ? `知识块 ${target.blockId}` : `文档 ${target.documentId}`;
    throw conflict(`${what} 正在另一个未结束的变更集「${other.title}」(${other.id}) 中被修改，请等它结束。`, other);
  }
}

export function changeSetContents(db: Db, id: string) {
  const changeSet = findChangeSet(db, id);
  const blockItems = db
    .select({ revision: blockRevisions, block: blocks })
    .from(blockRevisions)
    .innerJoin(blocks, eq(blockRevisions.blockId, blocks.id))
    .where(eq(blockRevisions.changeSetId, id))
    .all();
  const documentItems = db
    .select({ revision: documentRevisions, document: documents })
    .from(documentRevisions)
    .innerJoin(documents, eq(documentRevisions.documentId, documents.id))
    .where(eq(documentRevisions.changeSetId, id))
    .all();
  const privateBlockIdsRead = db
    .selectDistinct({ blockId: privateReads.blockId })
    .from(privateReads)
    .where(eq(privateReads.changeSetId, id))
    .all()
    .map((r) => r.blockId);
  return { changeSet, blockItems, documentItems, privateBlockIdsRead };
}

export function listChangeSets(db: Db, filter: { status?: ChangeSetStatus[]; agentId?: string } = {}) {
  const conditions = [];
  if (filter.status) conditions.push(inArray(changeSets.status, filter.status));
  if (filter.agentId) conditions.push(eq(changeSets.createdById, filter.agentId));
  return db
    .select()
    .from(changeSets)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(changeSets.createdAt))
    .all();
}

export function submitChangeSet(db: Db, actor: Actor, id: string): ChangeSet {
  const cs = requireEditable(db, actor, id);
  const { blockItems, documentItems } = changeSetContents(db, id);
  if (blockItems.length + documentItems.length === 0) {
    throw invalid("这个变更集里还没有任何内容，不能提交审阅。");
  }
  // 站长写的批注要逐条回应过才能重新提交，避免只改了表面就交回来。
  const open = db
    .select({ id: reviewComments.id })
    .from(reviewComments)
    .where(and(eq(reviewComments.changeSetId, id), eq(reviewComments.status, "open")))
    .all();
  if (open.length > 0) {
    throw invalid(
      `还有 ${open.length} 条批注没有回复（${open.map((c) => c.id).join("、")}）。请按批注修改内容，再用 reply_comment 逐条说明怎么处理的，然后重新提交。`,
      { openCommentIds: open.map((c) => c.id) },
    );
  }
  db.update(changeSets)
    .set({ status: "in_review", submittedAt: new Date(), decisionNote: null })
    .where(eq(changeSets.id, id))
    .run();
  return { ...cs, status: "in_review" };
}

export function withdrawChangeSet(db: Db, actor: Actor, id: string): ChangeSet {
  const cs = findChangeSet(db, id);
  assertOwnership(actor, cs);
  if (!ACTIVE.includes(cs.status)) throw conflict(`变更集 ${id} 已经结束（${cs.status}），不能撤回。`);
  db.transaction((tx) => {
    tx.update(changeSets).set({ status: "withdrawn", decidedAt: new Date() }).where(eq(changeSets.id, id)).run();
    // 为某个选题开的变更集撤回后，选题回到选题池，可以重新被领取。
    tx.update(topics).set({ status: "accepted", changeSetId: null }).where(and(eq(topics.changeSetId, id), eq(topics.status, "in_progress"))).run();
  });
  return { ...cs, status: "withdrawn" };
}

export type DecisionResult = {
  changeSet: ChangeSet;
  /** 内容发生变化、需要刷新缓存的文档和知识块 */
  affected: { slugs: string[]; blockIds: string[] };
};

/**
 * 批准或打回一个变更集。
 *
 * 这是"发布由程序把关"的唯一入口：只有站长能调用，MCP 接口里没有对应的工具。
 * 批准是原子的：变更集里的所有版本在同一个事务里生效。
 */
export function decideChangeSet(
  db: Db,
  actor: Actor,
  id: string,
  decision: "approve" | "reject",
  note?: string,
): DecisionResult {
  if (actor.kind !== "owner") throw forbidden("只有站长可以批准或打回变更集。");
  const cs = findChangeSet(db, id);
  if (cs.status !== "in_review") throw conflict(`变更集 ${id} 的状态是 ${cs.status}，只有待审状态可以做结论。`);

  const now = new Date();
  if (decision === "reject") {
    db.transaction((tx) => {
      tx.update(changeSets)
        .set({ status: "rejected", decisionNote: note?.trim() || null, decidedAt: now })
        .where(eq(changeSets.id, id))
        .run();
      // 记下被打回时的正文。Agent 改完重新提交后，站长只需要看改了什么，不用从头再读一遍。
      tx.update(documentRevisions)
        .set({ rejectedBody: sql`${documentRevisions.body}` })
        .where(and(eq(documentRevisions.changeSetId, id), eq(documentRevisions.state, "draft")))
        .run();
      tx.update(blockRevisions)
        .set({ rejectedBody: sql`${blockRevisions.body}` })
        .where(and(eq(blockRevisions.changeSetId, id), eq(blockRevisions.state, "draft")))
        .run();
    });
    return { changeSet: { ...cs, status: "rejected" }, affected: { slugs: [], blockIds: [] } };
  }

  const { blockItems, documentItems } = changeSetContents(db, id);

  return db.transaction((tx) => {
    const draftBlockIds = new Set(blockItems.map((b) => b.block.id));

    // 检查文档引用的每个知识块：批准之后必须有生效的版本，且不能是私密的。
    for (const item of documentItems) {
      const docRefs = tx
        .select({ blockId: refs.blockId, visibility: blocks.visibility, current: blocks.currentRevisionId })
        .from(refs)
        .innerJoin(blocks, eq(refs.blockId, blocks.id))
        .where(eq(refs.documentRevisionId, item.revision.id))
        .all();
      const privateIds = [...new Set(docRefs.filter((r) => r.visibility === "private").map((r) => r.blockId))];
      if (privateIds.length > 0) {
        throw invalid(
          `文档「${item.revision.title}」引用了私密知识块 ${privateIds.join("、")}，不能发布。请先移除这些引用，或把知识块改为公开。`,
          { privateBlockIds: privateIds },
        );
      }
      const missing = [...new Set(docRefs.filter((r) => !r.current && !draftBlockIds.has(r.blockId)).map((r) => r.blockId))];
      if (missing.length > 0) {
        throw invalid(`文档「${item.revision.title}」引用的知识块 ${missing.join("、")} 没有生效的版本。`);
      }
    }

    for (const { revision, block } of blockItems) {
      const previous = block.currentRevisionId;
      tx.update(blockRevisions).set({ state: "approved" }).where(eq(blockRevisions.id, revision.id)).run();
      tx.update(blocks).set({ currentRevisionId: revision.id, status: "verified", staleReason: null }).where(eq(blocks.id, block.id)).run();
      // "不改变含义"的修改：原有的依据引用直接改为锁定新版本，不产生修订任务。
      if (previous && !revision.semanticChange) {
        tx.update(refs)
          .set({ pinnedBlockRevisionId: revision.id })
          .where(and(eq(refs.blockId, block.id), eq(refs.pinnedBlockRevisionId, previous)))
          .run();
      }
    }

    for (const { revision, document } of documentItems) {
      tx.update(documentRevisions).set({ state: "approved" }).where(eq(documentRevisions.id, revision.id)).run();
      tx.update(documents)
        .set({ currentRevisionId: revision.id, status: "published", publishedAt: document.publishedAt ?? now })
        .where(eq(documents.id, document.id))
        .run();
    }

    tx.update(changeSets)
      .set({ status: "approved", decisionNote: note?.trim() || null, decidedAt: now })
      .where(eq(changeSets.id, id))
      .run();
    // 为某个选题开的变更集批准后，这个选题就写完了。
    tx.update(topics).set({ status: "done" }).where(eq(topics.changeSetId, id)).run();

    return {
      changeSet: { ...cs, status: "approved" as const },
      affected: {
        slugs: documentItems.map((d) => d.document.slug),
        blockIds: blockItems.map((b) => b.block.id),
      },
    };
  });
}

/** 在事务里抛出它，放弃这次直接修改，并把结果带到事务外面。 */
class Abandon {
  constructor(readonly result: unknown) {}
}

/**
 * 站长的直接修改（设计文档 5.2 第 5 条）：不经过审阅，立即生效，但同样留下版本记录。
 *
 * 做法是替站长开一个变更集，在里面完成修改，然后当场提交并批准，全部在一个事务里。
 * 这样站长的修改和 Agent 的修改走的是同一套规则：引用的校验、版本的锁定、
 * 知识块变化后文章的过期判定，都不需要另写一份；回滚时也同样以变更集为单位。
 *
 * keep 返回假时整个事务回滚，什么都不留下（例如正文有错误，没能保存）。
 */
export function applyOwnerChange<T>(
  db: Db,
  actor: Actor,
  meta: { kind: ChangeSetKind; title: string; summary?: string },
  work: (tx: Db, changeSetId: string) => T,
  keep: (result: T) => boolean = () => true,
): { applied: true; result: T; affected: DecisionResult["affected"] } | { applied: false; result: T } {
  if (actor.kind !== "owner") throw forbidden("只有站长可以不经审阅直接修改内容。");
  try {
    return db.transaction((tx) => {
      const inner = tx as unknown as Db;
      const cs = openChangeSet(inner, actor, meta);
      const result = work(inner, cs.id);
      if (!keep(result)) throw new Abandon(result);
      submitChangeSet(inner, actor, cs.id);
      const { affected } = decideChangeSet(inner, actor, cs.id, "approve");
      return { applied: true as const, result, affected };
    });
  } catch (e) {
    if (e instanceof Abandon) return { applied: false, result: e.result as T };
    throw e;
  }
}
