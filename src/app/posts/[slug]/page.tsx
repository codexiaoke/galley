import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition, type CSSProperties } from "react";
import { Markdown } from "@/render/Markdown";
import { Toc } from "@/render/client/toc";
import { extractToc } from "@/render/toc";
import { runTraces } from "@/core/algo/trace";
import { loadNavigation, loadPublishedDocument, loadRelated, loadTerms } from "../../data";
import { tagPath } from "@/core/tags";
import { ReaderSettings } from "../../reader-settings";
import { loadSite } from "../../site";
import { SiteFooter } from "../../site-footer";
import { SiteShell } from "../../site-shell";
import { TrackView } from "../../track-view";
import { SiteHeader } from "../../site-header";

const formatDate = (d: Date | null) => {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

/**
 * 分享和搜索引擎用的信息：摘要、发布和修改时间、标签。分享卡片的图片由同目录的 opengraph-image.tsx 生成，框架会自动加上。
 * 页面标题写在页面里（<title>），这里不重复。
 */
export async function generateMetadata({ params }: PageProps<"/posts/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [doc, site] = await Promise.all([loadPublishedDocument(slug), loadSite()]);
  if (!doc || doc.kind !== "article") return {};
  return {
    description: doc.summary || undefined,
    alternates: { canonical: `/posts/${doc.slug}` },
    openGraph: {
      type: "article",
      siteName: site.name,
      locale: "zh_CN",
      title: doc.title,
      description: doc.summary || undefined,
      url: `/posts/${doc.slug}`,
      publishedTime: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : undefined,
      modifiedTime: new Date(doc.revisedAt).toISOString(),
      authors: site.author ? [site.author] : undefined,
      tags: doc.tags,
    },
    twitter: { card: "summary_large_image", title: doc.title, description: doc.summary || undefined },
  };
}

/** 给搜索引擎看的结构化信息（schema.org 的 BlogPosting）。 */
function ArticleJsonLd({ doc, site }: { doc: NonNullable<Awaited<ReturnType<typeof loadPublishedDocument>>>; site: Awaited<ReturnType<typeof loadSite>> }) {
  const url = site.url ? `${site.url}/posts/${doc.slug}` : undefined;
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: doc.title,
    description: doc.summary || undefined,
    datePublished: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : undefined,
    dateModified: new Date(doc.revisedAt).toISOString(),
    author: site.author ? { "@type": "Person", name: site.author } : undefined,
    publisher: { "@type": "Organization", name: site.name },
    mainEntityOfPage: url,
    url,
    image: url ? `${url}/opengraph-image` : undefined,
    keywords: doc.tags.length ? doc.tags.join(", ") : undefined,
    articleSection: doc.category?.name,
    isPartOf: doc.series ? { "@type": "CreativeWorkSeries", name: doc.series } : undefined,
    inLanguage: "zh-CN",
  };
  // 把 < 转义掉，正文里的文字不可能提前结束这段脚本
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export default function PostPage({ params }: PageProps<"/posts/[slug]">) {
  return (
    <Suspense fallback={null}>
      <SiteShell>
        <div className="galley-progress" aria-hidden="true" />
        <main className="galley-page pb-20">
          <Post params={params} />
        </main>
      </SiteShell>
    </Suspense>
  );
}

async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [doc, site, terms] = await Promise.all([loadPublishedDocument(slug), loadSite(), loadTerms()]);
  // 页面（比如"关于"）有自己的网址，不在文章的网址下显示。
  if (!doc || doc.kind !== "article") notFound();

  const nav = await loadNavigation(doc.id);
  // 这一页上已经列出来的文章不再推荐一次
  const shown = [...(nav.series?.items.map((i) => i.slug) ?? []), nav.previous?.slug, nav.next?.slug].filter((s) => !!s) as string[];
  const related = await loadRelated(doc.id, shown);
  const toc = extractToc(doc.body);
  // 正文里的演示代码先在沙箱里跑一遍（结果有缓存），渲染时直接取
  const traces = await runTraces(doc.body);
  const published = formatDate(doc.publishedAt);
  const revised = formatDate(doc.revisedAt);
  return (
    <>
      <SiteHeader current={doc.category?.slug} />
      <article className="galley-article">
        <title>{`${doc.title} · ${site.name}`}</title>
        <ArticleJsonLd doc={doc} site={site} />
        <header className="galley-article-header">
          {/* 文章变成全屏的幻灯片，一步一步讲（见 present/page.tsx） */}
          <Link href={`/posts/${doc.slug}/present`} className="galley-present-link" title="演示：变成幻灯片一步一步讲" prefetch={false}>
            演示
          </Link>
          <ReaderSettings />
          <ViewTransition name={`post-title-${doc.id}`} share="morph-title" default="none">
            <h1 className="galley-title">{doc.title}</h1>
          </ViewTransition>
          <p className="galley-meta galley-rise" style={{ "--i": 1 } as CSSProperties}>
            <time>{published}</time>
            {/* 改过的文章可以看每一次改了什么（见 history/page.tsx） */}
            {doc.revNo > 1 && (
              <>
                <span aria-hidden="true">　</span>
                <Link href={`/posts/${doc.slug}/history`} className="galley-meta-history" prefetch={false}>
                  {revised !== published ? `更新于 ${revised}` : "修改记录"}
                </Link>
              </>
            )}
            {doc.category && (
              <>
                <span aria-hidden="true">　·　</span>
                <Link href={`/category/${doc.category.slug}`} className="galley-meta-category">
                  {doc.category.name}
                </Link>
              </>
            )}
          </p>
        </header>
        {nav.series && <SeriesBox series={nav.series} />}
        {toc.length >= 3 && <Toc items={toc} />}
        <div className="galley-rise" style={{ "--i": 2 } as CSSProperties}>
          <Markdown body={doc.body} blocks={doc.blocks} posts={doc.posts} traces={traces} terms={terms} />
        </div>
        {doc.tags.length > 0 && (
          <p className="galley-tags">
            {doc.tags.map((tag) => (
              <Link key={tag} href={tagPath(tag)}>
                {tag}
              </Link>
            ))}
          </p>
        )}
        {related.length > 0 && (
          <nav className="galley-related" aria-label="相关文章">
            <p className="galley-related-kicker">讲到同样东西的</p>
            <ul>
              {related.map((post) => (
                <li key={post.slug}>
                  <Link href={`/posts/${post.slug}`}>{post.title}</Link>
                  {post.shared.length > 0 && <span className="galley-related-shared">都讲到 {post.shared.slice(0, 3).join("、")}</span>}
                </li>
              ))}
            </ul>
          </nav>
        )}
        {(nav.previous || nav.next) && (
          <nav className="galley-prevnext" aria-label={nav.series ? "系列里的上一篇和下一篇" : "上一篇和下一篇"}>
            {nav.previous ? (
              <Link href={`/posts/${nav.previous.slug}`} className="galley-prevnext-link" data-dir="prev">
                <span className="galley-prevnext-label">← 上一篇</span>
                <span className="galley-prevnext-title">{nav.previous.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {nav.next && (
              <Link href={`/posts/${nav.next.slug}`} className="galley-prevnext-link" data-dir="next">
                <span className="galley-prevnext-label">下一篇 →</span>
                <span className="galley-prevnext-title">{nav.next.title}</span>
              </Link>
            )}
          </nav>
        )}
      </article>
      <SiteFooter from={`/posts/${doc.slug}`} />
      <TrackView path={`/posts/${doc.slug}`} />
    </>
  );
}

/** 系列目录：放在正文前面，列出这个系列的每一篇，当前这篇加粗。篇数多时默认收起，只露出当前是第几篇。 */
function SeriesBox({ series }: { series: { name: string; items: { slug: string; title: string; current: boolean }[] } }) {
  const index = series.items.findIndex((i) => i.current);
  return (
    <details className="galley-series" open={series.items.length <= 6}>
      <summary>
        <span className="galley-series-kicker">系列</span>
        <span className="galley-series-name">{series.name}</span>
        <span className="galley-series-count">
          第 {index + 1} 篇，共 {series.items.length} 篇
        </span>
      </summary>
      <ol>
        {series.items.map((item) => (
          <li key={item.slug} aria-current={item.current ? "page" : undefined}>
            {item.current ? <span>{item.title}</span> : <Link href={`/posts/${item.slug}`}>{item.title}</Link>}
          </li>
        ))}
      </ol>
    </details>
  );
}
