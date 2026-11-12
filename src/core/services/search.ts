import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { categories, documentRevisions, documents } from "../db/schema";
import { plainText } from "../markup/text";

/**
 * 站内搜索：在已发布的文章里找。
 *
 * 个人站点的文章数量有限，直接逐篇比对就够快，不需要建索引；
 * 中文也不需要分词，按读者输入的字原样查找。文章多到变慢时再换成全文索引。
 */

export type SearchResult = {
  slug: string;
  title: string;
  /** 命中位置附近的一段文字；只在标题里命中时是文章的摘要 */
  snippet: string;
  publishedAt: Date | null;
  categoryName: string | null;
};

const SNIPPET = 90;
const MAX_TERMS = 6;

/** 把搜索词拆开：按空白分隔，去掉重复的，最多取前几个。 */
export function searchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, MAX_TERMS);
}

function snippetAround(text: string, lower: string, terms: string[]): string {
  const positions = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  if (positions.length === 0) return "";
  const at = Math.min(...positions);
  const start = Math.max(0, at - 24);
  const piece = text.slice(start, start + SNIPPET).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${piece}${start + SNIPPET < text.length ? "…" : ""}`;
}

export function searchPublished(db: Db, query: string, limit = 30): SearchResult[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const rows = db
    .select({
      slug: documents.slug,
      title: documentRevisions.title,
      summary: documentRevisions.summary,
      body: documentRevisions.body,
      tags: documentRevisions.tags,
      publishedAt: documents.publishedAt,
      categoryName: categories.name,
    })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .leftJoin(categories, eq(documentRevisions.categoryId, categories.id))
    .where(and(eq(documents.kind, "article"), eq(documents.status, "published")))
    .orderBy(desc(documents.publishedAt))
    .all();

  return rows
    .map((row) => {
      const title = row.title.toLowerCase();
      const summary = row.summary.toLowerCase();
      const tags = row.tags.join(" ").toLowerCase();
      const text = plainText(row.body);
      const lower = text.toLowerCase();
      // 每个词都要在这篇文章里出现；出现在标题里的分量最重，其次是摘要，再次是正文。
      let score = 0;
      for (const term of terms) {
        const hit = (title.includes(term) ? 5 : 0) + (tags.includes(term) ? 3 : 0) + (summary.includes(term) ? 2 : 0) + (lower.includes(term) ? 1 : 0);
        if (hit === 0) return undefined;
        score += hit;
      }
      const snippet = snippetAround(text, lower, terms) || row.summary;
      return { score, result: { slug: row.slug, title: row.title, snippet, publishedAt: row.publishedAt, categoryName: row.categoryName } };
    })
    .filter((x) => x !== undefined)
    // sort 是稳定的：分数相同的保持"新的在前"。
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.result);
}
