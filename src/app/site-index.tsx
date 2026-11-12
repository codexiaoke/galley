import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition, type CSSProperties } from "react";
import { connection } from "next/server";
import { tagPath } from "@/core/tags";
import { loadCategories, loadPublishedList } from "./data";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { loadSite } from "./site";
import { TrackView } from "./track-view";

const two = (n: number) => String(n).padStart(2, "0");
const formatDate = (d: Date | null) => {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()}.${two(date.getMonth() + 1)}.${two(date.getDate())}`;
};

/**
 * 首页、分类页和标签页共用的版面：顶部一行，下面是文章列表，一篇一行。
 * 首页显示全部文章；给出分类或标签时只显示其中的文章。
 */
export async function SiteIndex({ categorySlug, tag }: { categorySlug?: string; tag?: string }) {
  // 内容来自运行时的数据库，不能在构建时预渲染：构建环境里的数据库不是线上的那一个。
  // 数据本身仍然走缓存，内容变化时由标签刷新。
  await connection();
  const [categories, posts, site] = await Promise.all([loadCategories(), loadPublishedList(categorySlug, tag), loadSite()]);
  if (categorySlug && !categories.some((c) => c.slug === categorySlug)) notFound();
  if (tag && posts.length === 0) notFound();

  return (
    <main className="galley-home">
      {/* 标签页不属于任何分类，导航里不标出当前项 */}
      <SiteHeader current={tag ? undefined : (categorySlug ?? null)} />
      {tag && (
        <>
          <title>{`${tag} · ${site.name}`}</title>
          <p className="galley-index-heading">
            标签<span aria-hidden="true">　·　</span>
            <strong>{tag}</strong>
            <span className="galley-index-count">{posts.length} 篇</span>
          </p>
        </>
      )}
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
      <SiteFooter />
      <TrackView path={tag ? tagPath(tag) : categorySlug ? `/category/${categorySlug}` : "/"} />
    </main>
  );
}
