import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition, type CSSProperties } from "react";
import { connection } from "next/server";
import { loadCategories, loadPublishedList } from "./data";
import { SiteHeader } from "./site-header";

const two = (n: number) => String(n).padStart(2, "0");
const formatDate = (d: Date | null) => {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()}.${two(date.getMonth() + 1)}.${two(date.getDate())}`;
};

/**
 * 首页和分类页共用的版面：顶部一行，下面是文章列表，一篇一行。
 * 首页显示全部文章；给出分类时只显示该分类下的文章。
 */
export async function SiteIndex({ categorySlug }: { categorySlug?: string }) {
  // 内容来自运行时的数据库，不能在构建时预渲染：构建环境里的数据库不是线上的那一个。
  // 数据本身仍然走缓存，内容变化时由标签刷新。
  await connection();
  const [categories, posts] = await Promise.all([loadCategories(), loadPublishedList(categorySlug)]);
  if (categorySlug && !categories.some((c) => c.slug === categorySlug)) notFound();

  return (
    <main className="galley-home">
      <SiteHeader current={categorySlug ?? null} />
      {posts.length === 0 ? (
        <p className="galley-empty">{categorySlug ? "这个分类下还没有文章。" : "还没有已发布的文章。"}</p>
      ) : (
        <ul className="galley-list">
          {posts.map((post, index) => (
            // --i 是这一行的序号，样式表用它让各行依次出现
            <li key={post.id} className="galley-rise" style={{ "--i": Math.min(index, 10) } as CSSProperties}>
              <Link href={`/posts/${post.slug}`} className="galley-row">
                <span className="galley-row-main">
                  {/* 点进文章时，这个标题会移动、放大成文章页的标题 */}
                  <ViewTransition name={`post-title-${post.id}`} share="morph-title" default="none">
                    <span className="galley-row-title">{post.title}</span>
                  </ViewTransition>
                  {post.summary && <span className="galley-row-summary">{post.summary}</span>}
                </span>
                <span className="galley-row-meta">
                  <time>{formatDate(post.publishedAt)}</time>
                  {post.categoryName && <span className="galley-row-category">{post.categoryName}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
