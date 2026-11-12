import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { actorColumns, type Actor } from "../actor";
import type { Db } from "../db/client";
import {
  blocks,
  categories,
  changeSets,
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
import { applyOwnerChange, assertNotLockedElsewhere, requireEditable } from "./changeSets";
import { checkImages } from "./media";
import { normalizeTags, sameTag } from "../tags";

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
  /** 标签。省略时沿用文档当前的标签，传空数组表示去掉全部标签 */
  tags?: string[];
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

/** 一段依据文字超过这个长度就提醒：依据应该只包住承载那个说法的半句话。 */
const LONG_CITATION = 60;
/** 依据文字占正文的比例超过这个值就提醒：文章应该有自己的串联，而不是把知识块一条条复述。 */
const CITATION_COVERAGE_LIMIT = 0.6;

/**
 * 检查依据标记的用法是否得当。只给提醒，不阻止保存。
 * 真实的 Agent 很容易把整段文字都包进依据里，文章读起来就成了知识块的逐条复述。
 */
function citationStyleWarnings(body: string, parsed: ParsedRef[]): MarkupIssue[] {
  const warnings: MarkupIssue[] = [];
  // 一段依据依赖多个知识块时会产生多条引用（同一行、同一段文字），只算一次。
  const spanByPlace = new Map<string, { text: string; line?: number }>();
  for (const ref of parsed) {
    if (ref.mode === "cite" && ref.spanText) spanByPlace.set(`${ref.line}:${ref.spanText}`, { text: ref.spanText, line: ref.line });
  }
  const spans = [...spanByPlace.values()];

  for (const { text, line } of spans) {
    if ([...text].length > LONG_CITATION) {
      warnings.push({
        level: "warning",
        line,
        message: `这段依据有 ${[...text].length} 个字，太长了。依据只需要包住承载那个说法的半句话，解释、过渡和你自己的串联写在标记外面。`,
      });
    }
  }

  // 粗略估算正文的字数：去掉标记本身的符号和参数，只留文字。
  const prose = body
    .replace(/\{[^}]*\}/g, "")
    .replace(/^:{2,3}\w*.*$/gm, "")
    .replace(/:cite\[/g, "")
    .replace(/[#>*`\[\]\s]/g, "");
  const cited = spans.reduce((n, { text }) => n + [...text.replace(/\s/g, "")].length, 0);
  const total = [...prose].length;
  if (total >= 200 && cited / total > CITATION_COVERAGE_LIMIT) {
    warnings.push({
      level: "warning",
      message: `正文有 ${Math.round((cited / total) * 100)}% 的文字包在依据标记里，读起来会像知识块的逐条复述。请用自己的话把它们串起来，只在具体的说法上加依据。`,
    });
  }
  return warnings;
}

/**
 * 检查一段正文：标记写得对不对、引用的知识块在不在、依据用得是否得当。
 * 保存时用它，Agent 提交前自查时也用它，两处的结论一致。
 */
export function checkDocumentBody(db: Db, changeSetId: string, body: string): MarkupIssue[] {
  const parsed = parseMarkup(body);
  return [...parsed.issues, ...checkRefs(db, changeSetId, parsed.refs).issues, ...checkImages(db, parsed.images), ...citationStyleWarnings(body, parsed.refs)];
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

  const tags = input.tags === undefined ? undefined : normalizeTags(input.tags);
  const parsed = parseMarkup(input.body);
  const checked = checkRefs(db, input.changeSetId, parsed.refs);
  const issues = [...parsed.issues, ...checked.issues, ...checkImages(db, parsed.images), ...citationStyleWarnings(input.body, parsed.refs)];
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
    // 省略摘要时沿用原来的：先看这个变更集里的草稿，再看线上的版本。
    // 之前省略会把摘要清空，Agent 只想改正文时很容易误删。要清空摘要，明确传空字符串。
    const previousSummary =
      draft?.summary ??
      (existing?.currentRevisionId
        ? tx.select({ summary: documentRevisions.summary }).from(documentRevisions).where(eq(documentRevisions.id, existing.currentRevisionId)).get()?.summary
        : undefined);
    const content = { title, summary: input.summary !== undefined ? input.summary.trim() : (previousSummary ?? ""), body: input.body };
    if (draft) {
      revisionId = draft.id;
      tx.update(documentRevisions)
        .set({ ...content, ...(categoryId === undefined ? {} : { categoryId }), ...(tags === undefined ? {} : { tags }) })
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
            .select({ categoryId: documentRevisions.categoryId, tags: documentRevisions.tags })
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
          tags: tags ?? current?.tags ?? [],
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

/**
 * 只改正文里的一小段：把 find 换成 replace，其余原样保留。
 *
 * find 必须在正文里恰好出现一次。这样改一句话不需要把整篇正文重新提交一遍，
 * 也就不会在重抄的过程中不小心改掉别的地方（包括站长亲手改过的部分）。
 */
export function replaceInDocument(
  db: Db,
  actor: Actor,
  input: { changeSetId: string; documentId: string; find: string; replace: string },
): SaveDocumentResult {
  requireEditable(db, actor, input.changeSetId);
  if (!input.find) throw invalid("find 不能为空。");
  const current = getDocumentForEditing(db, { documentId: input.documentId }, input.changeSetId);
  const count = current.body.split(input.find).length - 1;
  if (count === 0) {
    throw invalid("正文里没有找到 find 给出的文字。它要和正文的源码逐字一致，包括标记和标点；先用 get_document 读一下现在的正文。");
  }
  if (count > 1) throw invalid(`find 给出的文字在正文里出现了 ${count} 次，不知道该改哪一处。请多带一些前后的文字，让它只出现一次。`);
  return saveDocument(db, actor, {
    changeSetId: input.changeSetId,
    documentId: input.documentId,
    title: current.title,
    body: current.body.replace(input.find, () => input.replace),
  });
}

/**
 * 站长直接修改一篇已经上线过的文章：立即生效，留下一个新版本。
 * 正文有错误时不会保存，返回问题清单。
 */
export function editDocumentAsOwner(
  db: Db,
  actor: Actor,
  input: { documentId: string; title: string; summary?: string; category?: string; tags?: string[]; body: string },
) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以不经审阅直接修改文档。");
  const doc = db.select().from(documents).where(eq(documents.id, input.documentId)).get();
  if (!doc) throw notFound(`文档 ${input.documentId} 不存在。`);
  if (!doc.currentRevisionId) throw conflict("这篇文档还没有上线过。它在某个待审的改动里，请到看板上打开那个改动来修改。");
  const outcome = applyOwnerChange(
    db,
    actor,
    { kind: doc.kind === "page" ? "page" : "document_edit", title: `站长修改：${input.title.trim() || doc.slug}` },
    (tx, changeSetId) => saveDocument(tx, actor, { ...input, changeSetId }),
    (result) => result.saved,
  );
  return { ...outcome.result, slugs: outcome.applied ? outcome.affected.slugs : [] };
}

/**
 * 站长自己新建一篇文章或一个页面：不经过审阅，保存后立即上线。
 * 和站长的其他直接修改一样，程序替站长开一条改动记录并当场批准。
 */
export function createDocumentAsOwner(
  db: Db,
  actor: Actor,
  input: { kind: DocumentKind; slug: string; title: string; summary?: string; category?: string; tags?: string[]; body: string },
) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以不经审阅直接发布文档。");
  const outcome = applyOwnerChange(
    db,
    actor,
    { kind: input.kind === "page" ? "page" : "article", title: `站长新建：${input.title.trim() || input.slug}` },
    (tx, changeSetId) => saveDocument(tx, actor, { ...input, slug: input.slug.trim(), changeSetId }),
    (result) => result.saved,
  );
  return { ...outcome.result, slugs: outcome.applied ? outcome.affected.slugs : [] };
}

/**
 * 编辑时的实时预览：检查正文，并取出它引用到的知识块，供界面渲染。
 * changeSetId 给出时，变更集里还没批准的知识块也能被引用（站长在待审的改动里直接改稿）。
 */
export function previewDocumentBody(db: Db, body: string, changeSetId = "") {
  const parsed = parseMarkup(body);
  const checked = checkRefs(db, changeSetId, parsed.refs);
  const blockMap: Record<string, BlockView> = {};
  for (const { block } of checked.resolved) blockMap[block.id] ??= block;
  return {
    issues: [...parsed.issues, ...checked.issues, ...checkImages(db, parsed.images), ...citationStyleWarnings(body, parsed.refs)],
    blocks: blockMap,
  };
}

export type RenderableDocument = {
  id: string;
  kind: DocumentKind;
  slug: string;
  title: string;
  summary: string;
  body: string;
  revNo: number;
  category: { slug: string; name: string } | null;
  tags: string[];
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
    tags: rev.tags,
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
    tags: rev.tags,
    body: rev.body,
  };
}

/** 已发布的文档，新的在前。给出分类时只返回该分类下的。 */
export function listPublished(db: Db, kind: DocumentKind = "article", opts: { categorySlug?: string; tag?: string } = {}) {
  const conditions = [eq(documents.kind, kind), eq(documents.status, "published")];
  if (opts.categorySlug) conditions.push(eq(categories.slug, opts.categorySlug));
  const rows = db
    .select({
      id: documents.id,
      slug: documents.slug,
      title: documentRevisions.title,
      summary: documentRevisions.summary,
      publishedAt: documents.publishedAt,
      /** 当前版本的时间，也就是最后一次修改的时间 */
      revisedAt: documentRevisions.createdAt,
      tags: documentRevisions.tags,
      categorySlug: categories.slug,
      categoryName: categories.name,
    })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .leftJoin(categories, eq(documentRevisions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(documents.publishedAt))
    .all();
  // 标签存在每个版本的 JSON 里，个人站点的文章不多，取出来再筛最简单。
  return opts.tag ? rows.filter((row) => row.tags.some((t) => sameTag(t, opts.tag!))) : rows;
}

/** 这个网址别名下有没有已发布的文档。用来在渲染页面之前判断该不该返回 404。 */
export function publishedSlugExists(db: Db, slug: string, kind: DocumentKind = "article"): boolean {
  return !!db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.slug, slug), eq(documents.status, "published"), eq(documents.kind, kind)))
    .get();
}

export type StaleCitation = {
  documentId: string;
  slug: string;
  documentTitle: string;
  blockId: string;
  blockStatus: string;
  spanText: string | null;
  reason: "block_updated" | "block_marked_stale";
  /** 标记过期时写下的原因 */
  staleReason: string | null;
  /** 这篇文档已经有一个还没结束的修订：是哪个变更集、什么状态。有的话不需要再处理一遍 */
  pendingRevision: { changeSetId: string; status: string } | null;
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
      staleReason: blocks.staleReason,
      pinned: refs.pinnedBlockRevisionId,
      current: blocks.currentRevisionId,
    })
    .from(refs)
    .innerJoin(documents, eq(documents.currentRevisionId, refs.documentRevisionId))
    .innerJoin(documentRevisions, eq(documentRevisions.id, refs.documentRevisionId))
    .innerJoin(blocks, eq(blocks.id, refs.blockId))
    .where(and(eq(refs.mode, "cite"), eq(documents.status, "published"), isNotNull(blocks.currentRevisionId)))
    .all();
  // 每篇文档当前是否有还没结束的修订（草稿版本所在的变更集处于进行中、待审或已打回）。
  const pending = new Map(
    db
      .select({ documentId: documentRevisions.documentId, changeSetId: changeSets.id, status: changeSets.status })
      .from(documentRevisions)
      .innerJoin(changeSets, eq(documentRevisions.changeSetId, changeSets.id))
      .where(and(eq(documentRevisions.state, "draft"), inArray(changeSets.status, ["open", "in_review", "rejected"])))
      .all()
      .map((r) => [r.documentId, { changeSetId: r.changeSetId, status: r.status as string }]),
  );
  return rows
    .filter((r) => r.pinned !== r.current || r.blockStatus === "stale" || r.blockStatus === "retired")
    .map(({ pinned, current, ...rest }) => ({
      ...rest,
      reason: pinned !== current ? ("block_updated" as const) : ("block_marked_stale" as const),
      pendingRevision: pending.get(rest.documentId) ?? null,
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
