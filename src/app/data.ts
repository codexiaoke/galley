import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { getDb } from "@/core/db/client";
import { listCategories } from "@/core/services/categories";
import { getPublishedDocument, listPublished, publishedSlugExists } from "@/core/services/documents";
import { listOperationLog } from "@/core/services/oplog";

/**
 * 前台读取的数据都带缓存，并打上同一个标签。
 * 任何会改变线上内容的操作（批准变更集、新建分类）都刷新这个标签。
 * 单人站点的页面数量不多，整体刷新最简单也最不容易出错；
 * 之后可以按文档和知识块细分标签，只刷新受影响的页面。
 *
 * 每个读取函数都分成两层：外层先等待真实的请求（connection），内层才是带缓存的读取。
 * 这样构建时不会执行任何读数据库的代码。否则构建时读到的内容（构建环境里的数据库是空的）
 * 会被当成缓存带到线上，表现为：部署之后站名、文章列表还是构建时的样子。
 */
export const PUBLIC_CONTENT_TAG = "public-content";

async function cachedPublishedList(categorySlug?: string, tag?: string) {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listPublished(getDb(), "article", { categorySlug, tag });
}

/** 已发布的文章，新的在前。给出分类或标签时只返回其中的。 */
export async function loadPublishedList(categorySlug?: string, tag?: string) {
  await connection();
  return cachedPublishedList(categorySlug, tag);
}

async function cachedOperationLog() {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listOperationLog(getDb());
}

/** 公开的运营日志。 */
export async function loadOperationLog() {
  await connection();
  return cachedOperationLog();
}

async function cachedCategories() {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return listCategories(getDb());
}

export async function loadCategories() {
  await connection();
  return cachedCategories();
}

async function cachedPublishedDocument(slug: string) {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return getPublishedDocument(getDb(), slug) ?? null;
}

export async function loadPublishedDocument(slug: string) {
  await connection();
  return cachedPublishedDocument(slug);
}

async function cachedHasAboutPage() {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return publishedSlugExists(getDb(), "about", "page");
}

/** 站长有没有写"关于"页。没写的话，页脚里不出现"关于"这个链接。 */
export async function loadHasAboutPage() {
  await connection();
  return cachedHasAboutPage();
}
