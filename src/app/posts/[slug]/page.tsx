import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition, type CSSProperties } from "react";
import { Markdown } from "@/render/Markdown";
import { loadPublishedDocument } from "../../data";
import { tagPath } from "@/core/tags";
import { ReaderSettings } from "../../reader-settings";
import { loadSite } from "../../site";
import { SiteFooter } from "../../site-footer";
import { TrackView } from "../../track-view";
import { SiteHeader } from "../../site-header";

const formatDate = (d: Date | null) => {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

export default function PostPage({ params }: PageProps<"/posts/[slug]">) {
  return (
    <div className="galley-site flex-1">
      <div className="galley-progress" aria-hidden="true" />
      <main className="galley-page pb-20">
        <Suspense fallback={null}>
          <Post params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [doc, site] = await Promise.all([loadPublishedDocument(slug), loadSite()]);
  // 页面（比如"关于"）有自己的网址，不在文章的网址下显示。
  if (!doc || doc.kind !== "article") notFound();

  const published = formatDate(doc.publishedAt);
  const revised = formatDate(doc.revisedAt);
  return (
    <>
      <SiteHeader current={doc.category?.slug} />
      <article className="galley-article">
        <title>{`${doc.title} · ${site.name}`}</title>
        <header className="galley-article-header">
          <ReaderSettings />
          <ViewTransition name={`post-title-${doc.id}`} share="morph-title" default="none">
            <h1 className="galley-title">{doc.title}</h1>
          </ViewTransition>
          <p className="galley-meta galley-rise" style={{ "--i": 1 } as CSSProperties}>
            <time>{published}</time>
            {doc.revNo > 1 && revised !== published && <span>　更新于 {revised}</span>}
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
        <div className="galley-rise" style={{ "--i": 2 } as CSSProperties}>
          <Markdown body={doc.body} blocks={doc.blocks} />
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
      </article>
      <SiteFooter from={`/posts/${doc.slug}`} />
      <TrackView path={`/posts/${doc.slug}`} />
    </>
  );
}
