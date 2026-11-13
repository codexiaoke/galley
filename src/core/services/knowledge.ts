import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { blockRevisions, blocks, changeSets, documentRevisions, documents, refs } from "../db/schema";
import { diffText } from "../diff";
import { findTerms, termSpellings, type Term } from "../markup/terms";
import { plainText } from "../markup/text";

export type { Term };

/**
 * 给读者看的知识结构：术语、站点的知识图谱、文章的修改记录。
 * 只用已经公开、已经核实的内容：草稿、私有、过期和下线的知识块都不出现。
 */

// ---- 术语 ----


const MAX_DEFINITION = 240;

function shorten(text: string, limit: number) {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  return chars.length > limit ? `${chars.slice(0, limit).join("")}……` : chars.join("");
}

/** 站点上所有公开、已核实的概念块，作为术语。 */
export function listTerms(db: Db): Term[] {
  const rows = db
    .select({ id: blocks.id, title: blockRevisions.title, body: blockRevisions.body, data: blockRevisions.data })
    .from(blocks)
    .innerJoin(blockRevisions, eq(blocks.currentRevisionId, blockRevisions.id))
    .where(and(eq(blocks.type, "concept"), eq(blocks.visibility, "public"), eq(blocks.status, "verified")))
    .orderBy(asc(blocks.createdAt))
    .all();
  const terms: Term[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const term = String(row.data.term ?? row.title).trim();
    // 两个概念块用了同一个术语时只取先建的那个，免得同一个词有两种解释。
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    const aliases = (Array.isArray(row.data.aliases) ? (row.data.aliases as unknown[]) : [])
      .map((a) => String(a).trim())
      .filter((a) => a && !seen.has(a.toLowerCase()));
    for (const a of aliases) seen.add(a.toLowerCase());
    terms.push({ id: row.id, term, aliases, definition: shorten(plainText(row.body), MAX_DEFINITION) });
  }
  return terms;
}

// ---- 知识图谱 ----

export type GraphNode =
  | { id: string; kind: "article"; title: string; slug: string; summary: string }
  | { id: string; kind: "concept"; title: string; definition: string; aliases: string[] };

export type GraphLink = { source: string; target: string; kind: "cites" | "mentions" | "links" | "related" };

export type SiteGraph = { nodes: GraphNode[]; links: GraphLink[] };

/**
 * 站点的知识图谱：文章和概念是点。
 * - 文章引用了某个概念块，或者正文里提到了这个术语：文章 → 概念
 * - 文章链接到站内另一篇文章（普通链接或文章卡片）：文章 → 文章
 * - 一个概念的定义里提到了另一个概念：概念 → 概念
 * 只画有连线的点：孤零零的概念对读者没有用。
 */
export function siteGraph(db: Db): SiteGraph {
  const terms = listTerms(db);
  const spellings = termSpellings(terms);
  const articles = db
    .select({ id: documents.id, slug: documents.slug, revisionId: documents.currentRevisionId, title: documentRevisions.title, summary: documentRevisions.summary, body: documentRevisions.body })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .where(and(eq(documents.kind, "article"), eq(documents.status, "published")))
    .all();

  const nodes = new Map<string, GraphNode>();
  for (const a of articles) nodes.set(a.id, { id: a.id, kind: "article", title: a.title, slug: a.slug, summary: a.summary });
  for (const t of terms) nodes.set(t.id, { id: t.id, kind: "concept", title: t.term, definition: t.definition, aliases: t.aliases });

  const links = new Map<string, GraphLink>();
  const add = (source: string, target: string, kind: GraphLink["kind"]) => {
    if (source === target || !nodes.has(source) || !nodes.has(target)) return;
    const key = [source, target].sort().join(" ");
    // 同一对点之间只画一条线，"引用"比"提到"更确定，优先保留。
    const existing = links.get(key);
    if (!existing || (existing.kind === "mentions" && kind === "cites")) links.set(key, { source, target, kind });
  };

  const revisionIds = articles.map((a) => a.revisionId!).filter(Boolean);
  const cited = revisionIds.length ? db.select({ revisionId: refs.documentRevisionId, blockId: refs.blockId }).from(refs).where(inArray(refs.documentRevisionId, revisionIds)).all() : [];
  const articleOfRevision = new Map(articles.map((a) => [a.revisionId, a.id]));
  for (const r of cited) add(articleOfRevision.get(r.revisionId)!, r.blockId, "cites");

  const bySlug = new Map(articles.map((a) => [a.slug, a.id]));
  for (const a of articles) {
    for (const t of findTerms(plainText(a.body), spellings)) add(a.id, t.id, "mentions");
    // 站内链接：/posts/别名，或者文章卡片 ::post{slug="别名"}
    for (const m of a.body.matchAll(/\/posts\/([a-z0-9-]+)|::post\{[^}]*slug="([a-z0-9-]+)"/g)) {
      const target = bySlug.get(m[1] ?? m[2]);
      if (target) add(a.id, target, "links");
    }
  }
  for (const t of terms) {
    for (const other of findTerms(t.definition, spellings, new Set([t.id]))) add(t.id, other.id, "related");
  }

  const linked = new Set([...links.values()].flatMap((l) => [l.source, l.target]));
  return { nodes: [...nodes.values()].filter((n) => linked.has(n.id)), links: [...links.values()] };
}

// ---- 修改记录 ----

export type PublicRevision = {
  id: string;
  /** 这一版上线的时间 */
  date: Date;
  /** 这次改了什么：变更集的标题；站长从日志里隐藏了的，只写"修改" */
  note: string;
  title: string;
  body: string;
  /** 和上一版相比增加、删去了多少字。第一版没有 */
  added: number;
  removed: number;
};

/** 一篇已发布文章上线过的每一版，新的在前。不是已发布的文章时返回 undefined。 */
export function publicHistory(db: Db, slug: string): { title: string; slug: string; revisions: PublicRevision[] } | undefined {
  const doc = db.select().from(documents).where(eq(documents.slug, slug)).get();
  if (!doc || doc.status !== "published" || doc.kind !== "article" || !doc.currentRevisionId) return undefined;
  const current = db.select({ revNo: documentRevisions.revNo }).from(documentRevisions).where(eq(documentRevisions.id, doc.currentRevisionId)).get();
  const rows = db
    .select({ rev: documentRevisions, cs: changeSets })
    .from(documentRevisions)
    .leftJoin(changeSets, eq(documentRevisions.changeSetId, changeSets.id))
    .where(and(eq(documentRevisions.documentId, doc.id), eq(documentRevisions.state, "approved")))
    .orderBy(asc(documentRevisions.revNo))
    .all()
    .filter(({ rev }) => rev.revNo <= (current?.revNo ?? 0));

  const revisions: PublicRevision[] = rows.map(({ rev, cs }, i) => {
    const previous = rows[i - 1]?.rev.body;
    const diff = previous === undefined ? undefined : diffText(previous, rev.body);
    return {
      id: rev.id,
      date: cs?.decidedAt ?? rev.createdAt,
      note: i === 0 ? "首次发布" : cs && !cs.hiddenFromLog ? cs.title : "修改",
      title: rev.title,
      body: rev.body,
      added: diff?.added ?? 0,
      removed: diff?.removed ?? 0,
    };
  });
  const latest = rows.at(-1)?.rev;
  return { title: latest?.title ?? "", slug: doc.slug, revisions: revisions.reverse() };
}
