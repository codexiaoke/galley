import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Markdown } from "@/render/Markdown";
import { prepareRender } from "@/core/prepare";
import { loadPublishedDocument } from "../data";
import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";
import { loadSite } from "../site";
import { SiteShell } from "../site-shell";
import { TrackView } from "../track-view";

/** "关于"页：站长在后台新建一个网址别名为 about 的页面，它就显示在这里。 */
export default function AboutPage() {
  return (
    <Suspense fallback={null}>
      <SiteShell>
        <main className="galley-page pb-12">
          <About />
        </main>
      </SiteShell>
    </Suspense>
  );
}

async function About() {
  const [doc, site] = await Promise.all([loadPublishedDocument("about"), loadSite()]);
  if (!doc || doc.kind !== "page") notFound();
  const { traces, scenes } = await prepareRender(doc.body);
  return (
    <>
      <SiteHeader />
      <article className="galley-article">
        <title>{`${doc.title} · ${site.name}`}</title>
        <header className="galley-article-header">
          <h1 className="galley-title">{doc.title}</h1>
        </header>
        <Markdown body={doc.body} blocks={doc.blocks} posts={doc.posts} traces={traces} scenes={scenes} />
      </article>
      <SiteFooter from="/about" />
      <TrackView path="/about" />
    </>
  );
}
