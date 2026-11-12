import { and, asc, eq, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { categories, documentRevisions, documents } from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function findCategoryBySlug(db: Db, slug: string) {
  return db.select().from(categories).where(eq(categories.slug, slug)).get();
}

/** 全部分类，按站长设定的顺序排列，附带每个分类下已发布文章的数量。 */
export function listCategories(db: Db) {
  const counts = db
    .select({ categoryId: documentRevisions.categoryId, n: sql<number>`count(*)` })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .where(and(eq(documents.status, "published"), eq(documents.kind, "article")))
    .groupBy(documentRevisions.categoryId)
    .all();
  const countOf = new Map(counts.map((c) => [c.categoryId, c.n]));
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.createdAt))
    .all()
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name, sortOrder: c.sortOrder, publishedCount: countOf.get(c.id) ?? 0 }));
}

/** 新建分类。只有站长可以：分类是站点的骨架，不交给 Agent 决定。 */
export function createCategory(db: Db, actor: Actor, input: { slug: string; name: string }) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以创建分类。");
  const slug = input.slug.trim();
  const name = input.name.trim();
  if (!name) throw invalid("分类需要一个名称。");
  if (!SLUG_PATTERN.test(slug)) throw invalid("分类的网址别名只能由小写字母、数字和连字符组成，例如 ai-coding。");
  if (findCategoryBySlug(db, slug)) throw conflict(`网址别名 "${slug}" 已被另一个分类使用。`);
  const last = db.select({ n: sql<number>`coalesce(max(${categories.sortOrder}), 0)` }).from(categories).get();
  const row = { id: newId(), slug, name, sortOrder: (last?.n ?? 0) + 1, createdAt: new Date() };
  db.insert(categories).values(row).run();
  return row;
}

/** 修改分类的名称、网址别名或排序。只有站长可以。 */
export function updateCategory(db: Db, actor: Actor, id: string, input: { slug: string; name: string; sortOrder?: number }) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改分类。");
  const existing = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) throw notFound("分类不存在。");
  const slug = input.slug.trim();
  const name = input.name.trim();
  if (!name) throw invalid("分类需要一个名称。");
  if (!SLUG_PATTERN.test(slug)) throw invalid("分类的网址别名只能由小写字母、数字和连字符组成，例如 ai-coding。");
  const taken = findCategoryBySlug(db, slug);
  if (taken && taken.id !== id) throw conflict(`网址别名 "${slug}" 已被另一个分类使用。`);
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder!) : existing.sortOrder;
  db.update(categories).set({ slug, name, sortOrder }).where(eq(categories.id, id)).run();
}

/** 删除分类。只要有文章的任何一个版本用过它，就不能删除，避免历史记录失去分类。 */
export function deleteCategory(db: Db, actor: Actor, id: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以删除分类。");
  const used = db.select({ n: sql<number>`count(*)` }).from(documentRevisions).where(eq(documentRevisions.categoryId, id)).get();
  if ((used?.n ?? 0) > 0) throw conflict("还有文章属于这个分类，不能删除。请先把这些文章改到别的分类。");
  const result = db.delete(categories).where(eq(categories.id, id)).run();
  if (result.changes === 0) throw notFound("分类不存在。");
}
