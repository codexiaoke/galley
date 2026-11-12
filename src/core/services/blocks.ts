import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { actorColumns, type Actor } from "../actor";
import { blockValues, validateBlockContent } from "../blocks/types";
import type { Db } from "../db/client";
import {
  blockRevisions,
  blocks,
  documentRevisions,
  documents,
  privateReads,
  refs,
  type BlockSource,
  type BlockStatus,
  type BlockType,
  type Visibility,
} from "../db/schema";
import { forbidden, notFound } from "../errors";
import { newBlockId, newId } from "../ids";
import { assertNotLockedElsewhere, requireEditable } from "./changeSets";

/** 一个知识块在某个上下文里呈现出来的样子：身份加上一个具体版本的内容。 */
export type BlockView = {
  id: string;
  type: BlockType;
  visibility: Visibility;
  status: BlockStatus;
  revisionId: string;
  revNo: number;
  /** 这个版本是否还只是变更集里的草稿 */
  isDraft: boolean;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sources: BlockSource[];
  values: Record<string, string>;
  /** 这个版本获得批准的时间近似值：版本的创建时间 */
  revisedAt: Date;
};

type BlockRow = typeof blocks.$inferSelect;
type RevisionRow = typeof blockRevisions.$inferSelect;

function toView(block: BlockRow, rev: RevisionRow): BlockView {
  return {
    id: block.id,
    type: block.type,
    visibility: block.visibility,
    status: block.status,
    revisionId: rev.id,
    revNo: rev.revNo,
    isDraft: rev.state === "draft",
    title: rev.title,
    body: rev.body,
    data: rev.data,
    sources: rev.sources,
    values: blockValues(block.type, rev.data),
    revisedAt: rev.createdAt,
  };
}

function draftRevisionIn(db: Db, blockId: string, changeSetId: string) {
  return db
    .select()
    .from(blockRevisions)
    .where(
      and(
        eq(blockRevisions.blockId, blockId),
        eq(blockRevisions.changeSetId, changeSetId),
        eq(blockRevisions.state, "draft"),
      ),
    )
    .get();
}

/**
 * 读取一个知识块。给出 changeSetId 时，优先返回该变更集里的草稿版本，
 * 否则返回当前生效的版本。两者都没有时返回 undefined。
 */
export function getBlockView(db: Db, blockId: string, opts: { changeSetId?: string } = {}): BlockView | undefined {
  const block = db.select().from(blocks).where(eq(blocks.id, blockId)).get();
  if (!block) return undefined;
  const draft = opts.changeSetId ? draftRevisionIn(db, blockId, opts.changeSetId) : undefined;
  if (draft) return toView(block, draft);
  if (!block.currentRevisionId) return undefined;
  const current = db.select().from(blockRevisions).where(eq(blockRevisions.id, block.currentRevisionId)).get();
  return current ? toView(block, current) : undefined;
}

/** 按指定的版本读取知识块，用于渲染锁定了版本的依据引用。 */
export function getBlockViewAtRevision(db: Db, revisionId: string): BlockView | undefined {
  const row = db
    .select({ block: blocks, revision: blockRevisions })
    .from(blockRevisions)
    .innerJoin(blocks, eq(blockRevisions.blockId, blocks.id))
    .where(eq(blockRevisions.id, revisionId))
    .get();
  return row ? toView(row.block, row.revision) : undefined;
}

/** Agent 读取知识块。读到私密块时留下记录，供站长审阅时参考（设计文档第 8 节）。 */
export function readBlockAsAgent(db: Db, actor: Actor, blockId: string, changeSetId?: string) {
  const view = getBlockView(db, blockId, { changeSetId });
  if (!view) throw notFound(`知识块 ${blockId} 不存在。`);
  if (view.visibility === "private" && actor.kind === "agent") {
    db.insert(privateReads)
      .values({ id: newId(), changeSetId: changeSetId ?? null, blockId, agentId: actor.id, createdAt: new Date() })
      .run();
  }
  return { block: view, usage: blockImpact(db, blockId) };
}

// ---- 搜索与查重 ------------------------------------------------------------

function bigrams(text: string): Set<string> {
  const s = text.toLowerCase().replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 两段文字的相似度（字符二元组的 Dice 系数），对中文不需要分词。 */
export function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return (2 * shared) / (x.size + y.size);
}

export type BlockSummary = Pick<BlockView, "id" | "type" | "visibility" | "status" | "title" | "body"> & {
  usageCount: number;
};

function currentBlocks(db: Db) {
  return db
    .select({ block: blocks, revision: blockRevisions })
    .from(blocks)
    .innerJoin(blockRevisions, eq(blocks.currentRevisionId, blockRevisions.id))
    .where(isNotNull(blocks.currentRevisionId))
    .all();
}

function usageCounts(db: Db, blockIds: string[]): Map<string, number> {
  if (blockIds.length === 0) return new Map();
  const rows = db
    .select({ blockId: refs.blockId, n: sql<number>`count(distinct ${documents.id})` })
    .from(refs)
    .innerJoin(documents, eq(documents.currentRevisionId, refs.documentRevisionId))
    .where(inArray(refs.blockId, blockIds))
    .groupBy(refs.blockId)
    .all();
  return new Map(rows.map((r) => [r.blockId, r.n]));
}

function summarize(db: Db, rows: { block: BlockRow; revision: RevisionRow }[]): BlockSummary[] {
  const counts = usageCounts(db, rows.map((r) => r.block.id));
  return rows.map(({ block, revision }) => ({
    id: block.id,
    type: block.type,
    visibility: block.visibility,
    status: block.status,
    title: revision.title,
    body: revision.body,
    usageCount: counts.get(block.id) ?? 0,
  }));
}

/**
 * 搜索已生效的知识块。查询按空白拆成多个词，每个词都要出现在标题或正文里。
 * 骨架阶段在内存里匹配；数据量变大后换成全文索引。
 */
export function searchBlocks(db: Db, query: string, opts: { type?: BlockType; limit?: number } = {}): BlockSummary[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = currentBlocks(db).filter(({ block, revision }) => {
    if (opts.type && block.type !== opts.type) return false;
    if (block.status === "retired") return false;
    const haystack = `${revision.title}\n${revision.body}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
  return summarize(db, matched.slice(0, opts.limit ?? 20));
}

const SIMILARITY_THRESHOLD = 0.5;

function findSimilar(db: Db, type: BlockType, text: string): BlockSummary[] {
  const scored = currentBlocks(db)
    .filter(({ block }) => block.type === type && block.status !== "retired")
    .map((row) => ({ row, score: similarity(text, `${row.revision.title}\n${row.revision.body}`) }))
    .filter((s) => s.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return summarize(db, scored.map((s) => s.row));
}

// ---- 新建与更新 ------------------------------------------------------------

export type CreateBlockInput = {
  changeSetId: string;
  type: BlockType;
  title: string;
  body: string;
  data?: unknown;
  sources?: unknown;
  visibility?: Visibility;
  /** 明确表示"已经看过相似的块，这确实是新内容" */
  confirmNew?: boolean;
};

export type CreateBlockResult =
  | { created: true; blockId: string; revisionId: string }
  | { created: false; similar: BlockSummary[]; message: string };

export function createBlock(db: Db, actor: Actor, input: CreateBlockInput): CreateBlockResult {
  requireEditable(db, actor, input.changeSetId);
  const content = validateBlockContent(input.type, input);

  if (!input.confirmNew) {
    const similar = findSimilar(db, input.type, `${content.title}\n${content.body}`);
    if (similar.length > 0) {
      return {
        created: false,
        similar,
        message: "已有相似的知识块。如果其中某个就是你要的内容，直接引用它；如果确实是新内容，带上 confirmNew: true 再创建一次。",
      };
    }
  }

  const who = actorColumns(actor);
  const blockId = newBlockId();
  const revisionId = newId();
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(blocks)
      .values({
        id: blockId,
        type: input.type,
        visibility: input.visibility ?? "public",
        status: "draft",
        currentRevisionId: null,
        createdByKind: who.kind,
        createdById: who.id,
        createdAt: now,
      })
      .run();
    tx.insert(blockRevisions)
      .values({
        id: revisionId,
        blockId,
        revNo: 1,
        ...content,
        semanticChange: true,
        reason: null,
        authorKind: who.kind,
        authorId: who.id,
        changeSetId: input.changeSetId,
        state: "draft",
        createdAt: now,
      })
      .run();
  });
  return { created: true, blockId, revisionId };
}

export type BlockImpact = {
  /** 以"依据"方式引用它的已发布文档：这些位置的文字可能需要重写 */
  citations: { documentId: string; slug: string; title: string; spanText: string | null }[];
  /** 以"嵌入"方式引用它的已发布文档：会自动跟随，仅供知悉 */
  embeds: { documentId: string; slug: string; title: string; mode: "embed" | "value" }[];
};

/** 一个知识块被哪些已发布文档引用。 */
export function blockImpact(db: Db, blockId: string): BlockImpact {
  const rows = db
    .select({
      documentId: documents.id,
      slug: documents.slug,
      title: documentRevisions.title,
      mode: refs.mode,
      spanText: refs.spanText,
    })
    .from(refs)
    .innerJoin(documents, eq(documents.currentRevisionId, refs.documentRevisionId))
    .innerJoin(documentRevisions, eq(documentRevisions.id, refs.documentRevisionId))
    .where(eq(refs.blockId, blockId))
    .orderBy(documents.slug, refs.ordinal)
    .all();
  const citations = rows
    .filter((r) => r.mode === "cite")
    .map(({ documentId, slug, title, spanText }) => ({ documentId, slug, title, spanText }));
  const embeds = rows
    .filter((r) => r.mode !== "cite")
    .map(({ documentId, slug, title, mode }) => ({ documentId, slug, title, mode: mode as "embed" | "value" }));
  return { citations, embeds };
}

export type ProposeBlockUpdateInput = {
  changeSetId: string;
  blockId: string;
  title?: string;
  body?: string;
  data?: unknown;
  sources?: unknown;
  /** 修正错别字、补充来源这类不改变含义的修改，设为 false */
  semanticChange?: boolean;
  reason: string;
};

/**
 * 在变更集里提议更新一个知识块，返回受影响的位置（设计文档 6.1）。
 * 同一个变更集里对同一个块重复提议时，覆盖之前的草稿。
 */
export function proposeBlockUpdate(db: Db, actor: Actor, input: ProposeBlockUpdateInput) {
  requireEditable(db, actor, input.changeSetId);
  const block = db.select().from(blocks).where(eq(blocks.id, input.blockId)).get();
  const base = getBlockView(db, input.blockId, { changeSetId: input.changeSetId });
  if (!block || !base) throw notFound(`知识块 ${input.blockId} 不存在。`);
  assertNotLockedElsewhere(db, input.changeSetId, { blockId: input.blockId });

  const content = validateBlockContent(block.type, {
    title: input.title ?? base.title,
    body: input.body ?? base.body,
    data: input.data ?? base.data,
    sources: input.sources ?? base.sources,
  });
  const who = actorColumns(actor);
  const semanticChange = input.semanticChange ?? true;
  const reason = input.reason.trim();

  const existing = draftRevisionIn(db, input.blockId, input.changeSetId);
  let revisionId: string;
  if (existing) {
    revisionId = existing.id;
    db.update(blockRevisions).set({ ...content, semanticChange, reason }).where(eq(blockRevisions.id, existing.id)).run();
  } else {
    revisionId = newId();
    const last = db
      .select({ n: sql<number>`coalesce(max(${blockRevisions.revNo}), 0)` })
      .from(blockRevisions)
      .where(eq(blockRevisions.blockId, input.blockId))
      .get();
    db.insert(blockRevisions)
      .values({
        id: revisionId,
        blockId: input.blockId,
        revNo: (last?.n ?? 0) + 1,
        ...content,
        semanticChange,
        reason,
        authorKind: who.kind,
        authorId: who.id,
        changeSetId: input.changeSetId,
        state: "draft",
        createdAt: new Date(),
      })
      .run();
  }

  const impact = blockImpact(db, input.blockId);
  return {
    revisionId,
    impact,
    nextStep: !semanticChange
      ? "已声明不改变含义：批准后引用它的文章不需要修订。"
      : impact.citations.length > 0
        ? "请逐个处理 citations 里的文档：用 save_document 在同一个变更集里保存修订后的正文；文字不需要改的，原样再保存一次即可更新锁定的版本。"
        : "没有文档以依据方式引用它，可以直接提交审阅。",
  };
}

/** 把知识块标记为可能已过期。站长和 Agent 都可以做，不需要审阅。 */
export function markBlockStale(db: Db, actor: Actor, blockId: string) {
  const block = db.select().from(blocks).where(eq(blocks.id, blockId)).get();
  if (!block || !block.currentRevisionId) throw notFound(`知识块 ${blockId} 不存在或还没有生效的版本。`);
  if (block.status === "retired") throw forbidden(`知识块 ${blockId} 已停用。`);
  db.update(blocks).set({ status: "stale" }).where(eq(blocks.id, blockId)).run();
  void actor;
  return { blockId, status: "stale" as const, impact: blockImpact(db, blockId) };
}

/** 只有站长能修改可见性（设计文档第 8 节）。 */
export function setBlockVisibility(db: Db, actor: Actor, blockId: string, visibility: Visibility) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改知识块的可见性。");
  const result = db.update(blocks).set({ visibility }).where(eq(blocks.id, blockId)).run();
  if (result.changes === 0) throw notFound(`知识块 ${blockId} 不存在。`);
}

/** 后台用：全部已生效的知识块，可按关键词和类型筛选。 */
export function listBlocks(db: Db, filter: { q?: string; type?: BlockType } = {}) {
  const terms = (filter.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const rows = currentBlocks(db).filter(({ block, revision }) => {
    if (filter.type && block.type !== filter.type) return false;
    const haystack = `${block.id}\n${revision.title}\n${revision.body}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
  const counts = usageCounts(db, rows.map((r) => r.block.id));
  return rows
    .sort((a, b) => b.revision.createdAt.getTime() - a.revision.createdAt.getTime())
    .map(({ block, revision }) => ({ ...toView(block, revision), usageCount: counts.get(block.id) ?? 0 }));
}

/** 把过期的知识块恢复为已核实。只有站长可以：这等于站长确认内容仍然成立。 */
export function confirmBlockVerified(db: Db, actor: Actor, blockId: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以确认知识块仍然成立。");
  const result = db.update(blocks).set({ status: "verified" }).where(and(eq(blocks.id, blockId), eq(blocks.status, "stale"))).run();
  if (result.changes === 0) throw notFound(`知识块 ${blockId} 不存在，或者不是过期状态。`);
}
