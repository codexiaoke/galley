import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/core/db/client";
import { listCategories } from "@/core/services/categories";
import { getPublishedDocument, listPublished } from "@/core/services/documents";

/**
 * 前台读取的数据都带缓存，并打上同一个标签。
 * 任何会改变线上内容的操作（批准变更集、新建分类）都刷新这个标签。
 * 单人站点的页面数量不多，整体刷新最简单也最不容易出错；
 * 之后可以按文档和知识块细分标签，只刷新受影响的页面。
 */
export const PUBLIC_CONTENT_TAG = "public-content";

/** 已发布的文章，新的在前。给出分类时只返回该分类下的。 */
export async function loadPublishedList(categorySlug?: string) {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listPublished(getDb(), "article", { categorySlug });
}

export async function loadCategories() {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listCategories(getDb());
}

export async function loadPublishedDocument(slug: string) {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return getPublishedDocument(getDb(), slug) ?? null;
}
