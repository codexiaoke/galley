import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { actorColumns, type Actor } from "../actor";
import type { Db } from "../db/client";
import {
  blocks,
  categories,
  documentRevisions,
  documents,
  refs,
  type DocumentKind,
} from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";
import { getComponent } from "../markup/components";
import { parseMarkup, type MarkupIssue, type ParsedRef } from "../markup/parse";
import { getBlockView, getBlockViewAtRevision, type BlockView } from "./blocks";
import { findCategoryBySlug, listCategories } from "./categories";
import { assertNotLockedElsewhere, requireEditable } from "./changeSets";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SaveDocumentInput = {
  changeSetId: string;
  /** 修改已有文档时给出；新建文档时省略，并给出 kind 和 slug */
  documentId?: string;
  kind?: DocumentKind;
  slug?: string;
  title: string;
  summary?: string;
  /** 分类的网址别名。省略时沿用文档当前的分类 */
  category?: string;
  body: string;
};

export type SaveDocumentResult =
  | { saved: false; issues: MarkupIssue[] }
  | { saved: true; documentId: string; revisionId: string; issues: MarkupIssue[] };

/** 找出与写错的编号最接近的已有编号，帮助 Agent 修正。 */
function nearestBlockIds(db: Db, wrong: string): string[] {
  const all = db.select({ id: blocks.id }).from(blocks).all();
  return all
    .map(({ id }) => ({ id, diff: [...id].filter((ch, i) => ch !== wrong[i]).length }))
    .filter((c) => c.diff <= 2)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3)
    .map((c) => c.id);
}

/** 依赖数据库的检查：知识块是否存在、引用方式与类型是否匹配等（设计文档 4.3）。 */
function checkRefs(db: Db, changeSetId: string, parsed: ParsedRef[]) {
  const issues: MarkupIssue[] = [];
  const resolved: { ref: ParsedRef; block: BlockView }[] = [];
  const error = (message: string, line?: number) => issues.push({ level: "error", message, line });

  for (const ref of parsed) {
    const block = getBlockView(db, ref.blockId, { changeSetId });
    if (!block) {
      const near = nearestBlockIds(db, ref.blockId);
      error(`引用的知识块 ${ref.blockId} 不存在。${near.length ? `相近的编号：${near.join("、")}。` : ""}`, ref.line);
      continue;
    }
    if (block.visibility === "private") {
      error(`${ref.blockId} 是私密知识块，不能出现在公开内容里。`, ref.line);
      continue;
    }
    if (ref.mode === "value") {
      const keys = Object.keys(block.values);
      if (!ref.valueKey || !(ref.valueKey in block.values)) {
        error(
          `${ref.blockId} 没有名为 ${ref.valueKey} 的取值。${keys.length ? `可用的有：${keys.join("、")}。` : "这个知识块没有任何命名取值。"}`,
          ref.line,
        );
        continue;
      }
    }
    if (ref.param) {
      const allowed = getComponent(ref.directive)?.blockParams?.[ref.param] ?? [];
      if (!allowed.includes(block.type)) {
        error(
          `${ref.blockId} 是 ${block.type} 类型，不能用于 ${ref.directive} 的 ${ref.param} 参数（需要 ${allowed.join(" 或 ")}）。`,
          ref.line,
        );
        continue;
      }
    }
    if (block.status === "stale" || block.status === "retired") {
      issues.push({
        level: "warning",
        message: `${ref.blockId} 的状态是 ${block.status}，建议先更新它再引用。`,
        line: ref.line,
      });
    }
    resolved.push({ ref, block });
  }
  return { issues, resolved };
}

/**
 * 在变更集里保存文档的一个新版本。正文有错误时不保存，把错误返回给调用方修正。
 * 同一个变更集里对同一篇文档重复保存时，覆盖之前的草稿。
 */
export function saveDocument(db: Db, actor: Actor, input: SaveDocumentInput): SaveDocumentResult {
  requireEditable(db, actor, input.changeSetId);
  const title = input.title.trim();
  if (!title) throw invalid("文档需要标题。");

  const existing = input.documentId
    ? db.select().from(documents).where(eq(documents.id, input.documentId)).get()
    : undefined;
  if (input.documentId && !existing) throw notFound(`文档 ${input.documentId} 不存在。`);
  if (!existing) {
    if (!input.kind || !input.slug) throw invalid("新建文档需要 kind 和 slug。");
    if (!SLUG_PATTERN.test(input.slug)) throw invalid("slug 只能由小写字母、数字和连字符组成，例如 my-first-post。");
    const taken = db.select({ id: documents.id }).from(documents).where(eq(documents.slug, input.slug)).get();
    if (taken) throw conflict(`slug "${input.slug}" 已被文档 ${taken.id} 使用。要修改那篇文档，请传入 documentId。`);
  } else {
    assertNotLockedElsewhere(db, input.changeSetId, { documentId: existing.id });
  }

  // 分类只能从站长建好的里面选。省略时沿用文档当前生效版本的分类。
  let categoryId: string | null | undefined;
  if (input.category !== undefined) {
    const category = findCategoryBySlug(db, input.category);
    if (!category) {
      const available = listCategories(db).map((c) => `${c.slug}（${c.name}）`);
      throw invalid(
        `分类 "${input.category}" 不存在。${available.length ? `可用的分类：${available.join("、")}。` : "站点还没有任何分类。"}新分类需要站长在后台创建。`,
      );
    }
    categoryId = category.id;
  } else if (!existing && input.kind === "article") {
    // 站点建了分类之后，新文章必须归入其中一个。
    const available = listCategories(db).map((c) => `${c.slug}（${c.name}）`);
    if (available.length > 0) {
      throw invalid(`新文章需要指定分类。可用的分类：${available.join("、")}。`);
    }
  }

  const parsed = parseMarkup(input.body);
  const checked = checkRefs(db, input.changeSetId, parsed.refs);
  const issues = [...parsed.issues, ...checked.issues];
  if (issues.some((i) => i.level === "error")) return { saved: false, issues };

  const who = actorColumns(actor);
  const now = new Date();

  return db.transaction((tx) => {
    const documentId = existing?.id ?? newId();
    if (!existing) {
      tx.insert(documents)
        .values({
          id: documentId,
          kind: input.kind!,
          slug: input.slug!,
          status: "draft",
          currentRevisionId: null,
          publishedAt: null,
          createdAt: now,
        })
        .run();
    }

    const draft = tx
      .select()
      .from(documentRevisions)
      .where(
        and(
          eq(documentRevisions.documentId, documentId),
          eq(documentRevisions.changeSetId, input.changeSetId),
          eq(documentRevisions.state, "draft"),
        ),
      )
      .get();

    let revisionId: string;
    const content = { title, summary: input.summary?.trim() ?? "", body: input.body };
    if (draft) {
      revisionId = draft.id;
      tx.update(documentRevisions)
        .set(categoryId === undefined ? content : { ...content, categoryId })
        .where(eq(documentRevisions.id, draft.id))
        .run();
      tx.delete(refs).where(eq(refs.documentRevisionId, draft.id)).run();
    } else {
      revisionId = newId();
      const last = tx
        .select({ n: sql<number>`coalesce(max(${documentRevisions.revNo}), 0)` })
        .from(documentRevisions)
        .where(eq(documentRevisions.documentId, documentId))
        .get();
      const current = existing?.currentRevisionId
        ? tx
            .select({ categoryId: documentRevisions.categoryId })
            .from(documentRevisions)
            .where(eq(documentRevisions.id, existing.currentRevisionId))
            .get()
        : undefined;
      tx.insert(documentRevisions)
        .values({
          id: revisionId,
          documentId,
          revNo: (last?.n ?? 0) + 1,
          ...content,
          categoryId: categoryId === undefined ? (current?.categoryId ?? null) : categoryId,
          authorKind: who.kind,
          authorId: who.id,
          changeSetId: input.changeSetId,
          state: "draft",
          createdAt: now,
        })
        .run();
    }

    for (const { ref, block } of checked.resolved) {
      tx.insert(refs)
        .values({
          id: newId(),
          documentRevisionId: revisionId,
          blockId: ref.blockId,
          mode: ref.mode,
          // 只有依据引用锁定版本：锁定到写作时看到的那个版本（设计文档 4.4）。
          pinnedBlockRevisionId: ref.mode === "cite" ? block.revisionId : null,
          ordinal: ref.ordinal,
          spanText: ref.spanText ?? null,
          valueKey: ref.valueKey ?? null,
        })
        .run();
    }
    return { saved: true as const, documentId, revisionId, issues };
  });
}

// ---- 读取 ------------------------------------------------------------------

export type RenderableDocument = {
  id: string;
  kind: DocumentKind;
  slug: string;
  title: string;
  summary: string;
  body: string;
  revNo: number;
  category: { slug: string; name: string } | null;
  publishedAt: Date | null;
  revisedAt: Date;
  /** 正文引用到的知识块，键是知识块编号 */
  blocks: Record<string, BlockView>;
  /** 依据引用锁定的版本已经不是当前版本的知识块编号 */
  staleBlockIds: string[];
};

function assemble(
  db: Db,
  doc: typeof documents.$inferSelect,
  rev: typeof documentRevisions.$inferSelect,
  changeSetId?: string,
): RenderableDocument {
  const docRefs = db.select().from(refs).where(eq(refs.documentRevisionId, rev.id)).all();
  const blockMap: Record<string, BlockView> = {};
  const stale = new Set<string>();
  for (const ref of docRefs) {
    // 依据引用显示它锁定的版本；嵌入类引用显示当前版本（预览时是变更集里的草稿）。
    const live = getBlockView(db, ref.blockId, { changeSetId });
    const pinned = ref.pinnedBlockRevisionId ? getBlockViewAtRevision(db, ref.pinnedBlockRevisionId) : undefined;
    const view = ref.mode === "cite" ? (pinned ?? live) : live;
    if (view) blockMap[ref.blockId] ??= view;
    if (live && (live.status === "stale" || live.status === "retired")) stale.add(ref.blockId);
  }
  const category = rev.categoryId
    ? db.select({ slug: categories.slug, name: categories.name }).from(categories).where(eq(categories.id, rev.categoryId)).get()
    : undefined;
  return {
    id: doc.id,
    kind: doc.kind,
    slug: doc.slug,
    title: rev.title,
    summary: rev.summary,
    body: rev.body,
    revNo: rev.revNo,
    category: category ?? null,
    publishedAt: doc.publishedAt,
    revisedAt: rev.createdAt,
    blocks: blockMap,
    staleBlockIds: [...stale],
  };
}

/** 读取已发布文档的当前版本，用于前台渲染。 */
export function getPublishedDocument(db: Db, slug: string): RenderableDocument | undefined {
  const doc = db.select().from(documents).where(eq(documents.slug, slug)).get();
  if (!doc || doc.status !== "published" || !doc.currentRevisionId) return undefined;
  const rev = db.select().from(documentRevisions).where(eq(documentRevisions.id, doc.currentRevisionId)).get();
  return rev ? assemble(db, doc, rev) : undefined;
}

/** 读取某个文档版本，用于审阅时预览。 */
export function getDocumentRevision(db: Db, revisionId: string): RenderableDocument | undefined {
  const row = db
    .select({ doc: documents, rev: documentRevisions })
    .from(documentRevisions)
    .innerJoin(documents, eq(documentRevisions.documentId, documents.id))
    .where(eq(documentRevisions.id, revisionId))
    .get();
  return row ? assemble(db, row.doc, row.rev, row.rev.changeSetId ?? undefined) : undefined;
}

/** Agent 读取文档：给出变更集时优先返回其中的草稿，否则返回当前生效的版本。 */
export function getDocumentForEditing(db: Db, key: { documentId?: string; slug?: string }, changeSetId?: string) {
  const doc = key.documentId
    ? db.select().from(documents).where(eq(documents.id, key.documentId)).get()
    : key.slug
      ? db.select().from(documents).where(eq(documents.slug, key.slug)).get()
      : undefined;
  if (!doc) throw notFound("文档不存在。请给出 documentId 或 slug。");
  const draft = changeSetId
    ? db
        .select()
        .from(documentRevisions)
        .where(
          and(
            eq(documentRevisions.documentId, doc.id),
            eq(documentRevisions.changeSetId, changeSetId),
            eq(documentRevisions.state, "draft"),
          ),
        )
        .get()
    : undefined;
  const rev =
    draft ??
    (doc.currentRevisionId
      ? db.select().from(documentRevisions).where(eq(documentRevisions.id, doc.currentRevisionId)).get()
      : undefined);
  if (!rev) throw notFound(`文档 ${doc.id} 还没有可读的版本。`);
  return {
    documentId: doc.id,
    kind: doc.kind,
    slug: doc.slug,
    status: doc.status,
    isDraft: rev.state === "draft",
    revNo: rev.revNo,
    title: rev.title,
    summary: rev.summary,
    category: rev.categoryId
      ? (db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, rev.categoryId)).get()?.slug ?? null)
      : null,
    body: rev.body,
  };
}

/** 已发布的文档，新的在前。给出分类时只返回该分类下的。 */
export function listPublished(db: Db, kind: DocumentKind = "article", opts: { categorySlug?: string } = {}) {
  const conditions = [eq(documents.kind, kind), eq(documents.status, "published")];
  if (opts.categorySlug) conditions.push(eq(categories.slug, opts.categorySlug));
  return db
    .select({
      id: documents.id,
      slug: documents.slug,
      title: documentRevisions.title,
      summary: documentRevisions.summary,
      publishedAt: documents.publishedAt,
      categorySlug: categories.slug,
      categoryName: categories.name,
    })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .leftJoin(categories, eq(documentRevisions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(documents.publishedAt))
    .all();
}

export type StaleCitation = {
  documentId: string;
  slug: string;
  documentTitle: string;
  blockId: string;
  blockStatus: string;
  spanText: string | null;
  reason: "block_updated" | "block_marked_stale";
};

/**
 * 找出过期的依据引用（设计文档 4.4）：
 * 锁定的版本不是知识块当前生效的版本，或者知识块被标记为已过期或已停用。
 */
export function listStaleCitations(db: Db): StaleCitation[] {
  const rows = db
    .select({
      documentId: documents.id,
      slug: documents.slug,
      documentTitle: documentRevisions.title,
      blockId: blocks.id,
      blockStatus: blocks.status,
      spanText: refs.spanText,
      pinned: refs.pinnedBlockRevisionId,
      current: blocks.currentRevisionId,
    })
    .from(refs)
    .innerJoin(documents, eq(documents.currentRevisionId, refs.documentRevisionId))
    .innerJoin(documentRevisions, eq(documentRevisions.id, refs.documentRevisionId))
    .innerJoin(blocks, eq(blocks.id, refs.blockId))
    .where(and(eq(refs.mode, "cite"), eq(documents.status, "published"), isNotNull(blocks.currentRevisionId)))
    .all();
  return rows
    .filter((r) => r.pinned !== r.current || r.blockStatus === "stale" || r.blockStatus === "retired")
    .map(({ pinned, current, ...rest }) => ({
      ...rest,
      reason: pinned !== current ? ("block_updated" as const) : ("block_marked_stale" as const),
    }));
}

/** 已发布文档里以任何方式引用了这些知识块的文档，用于刷新页面缓存。 */
export function slugsReferencing(db: Db, blockIds: string[]): string[] {
  if (blockIds.length === 0) return [];
  return db
    .selectDistinct({ slug: documents.slug })
    .from(refs)
    .innerJoin(documents, eq(documents.currentRevisionId, refs.documentRevisionId))
    .where(inArray(refs.blockId, blockIds))
    .all()
    .map((r) => r.slug);
}

/** 后台用：全部文档，包括草稿和已下线的。显示的是当前生效的版本；还没有生效版本的显示最新的草稿。 */
export function listDocuments(db: Db) {
  const docs = db.select().from(documents).orderBy(desc(documents.createdAt)).all();
  return docs.map((doc) => {
    const revision = doc.currentRevisionId
      ? db.select().from(documentRevisions).where(eq(documentRevisions.id, doc.currentRevisionId)).get()
      : db
          .select()
          .from(documentRevisions)
          .where(eq(documentRevisions.documentId, doc.id))
          .orderBy(desc(documentRevisions.revNo))
          .get();
    const category = revision?.categoryId
      ? db.select({ name: categories.name }).from(categories).where(eq(categories.id, revision.categoryId)).get()
      : undefined;
    return {
      id: doc.id,
      kind: doc.kind,
      slug: doc.slug,
      status: doc.status,
      title: revision?.title ?? "（无标题）",
      revNo: revision?.revNo ?? 0,
      categoryName: category?.name ?? null,
      publishedAt: doc.publishedAt,
      createdAt: doc.createdAt,
    };
  });
}

/** 下线或重新上线一篇文档。只有站长可以。只对已经批准过的文档有效。 */
export function setDocumentPublished(db: Db, actor: Actor, documentId: string, published: boolean) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以上线或下线文档。");
  const doc = db.select().from(documents).where(eq(documents.id, documentId)).get();
  if (!doc) throw notFound("文档不存在。");
  if (!doc.currentRevisionId) throw conflict("这篇文档还没有批准过的版本，不能上线。请先在看板上批准它。");
  db.update(documents).set({ status: published ? "published" : "unpublished" }).where(eq(documents.id, documentId)).run();
  return { slug: doc.slug };
}
