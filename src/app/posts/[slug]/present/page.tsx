import { notFound } from "next/navigation";
import { Suspense } from "react";
import { runTraces } from "@/core/algo/trace";
import { plainText } from "@/core/markup/text";
import { Markdown } from "@/render/Markdown";
import { Presentation } from "@/render/client/present";
import { splitSlides } from "@/render/slides";
import { loadPublishedDocument } from "../../../data";
import { loadSite } from "../../../site";

/**
 * 演示模式：文章变成全屏的幻灯片。
 *
 * 网址参数（录制视频的脚本会用到，平时不用管）：
 * - auto=1：自动播放
 * - orientation=portrait：竖屏（9:16）
 * - captions=1：把讲稿当字幕显示
 * - durations=3000,5200,…：每一页至少停留多少毫秒（按朗读的长度）
 */
export default function PresentPage({ params, searchParams }: PageProps<"/posts/[slug]/present">) {
  return (
    <Suspense fallback={null}>
      <Present params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Present({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const query = await searchParams;
  const [doc, site] = await Promise.all([loadPublishedDocument(slug), loadSite()]);
  if (!doc || doc.kind !== "article") notFound();
  const traces = await runTraces(doc.body);
  const slides = splitSlides(doc.body);
  const one = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : undefined);
  const durations = one("durations")
    ?.split(",")
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 120000);
  const date = doc.publishedAt ? new Date(doc.publishedAt) : null;

  return (
    <>
      <title>{`${doc.title} · 演示 · ${site.name}`}</title>
      <meta name="robots" content="noindex" />
      <Presentation
        backHref={`/posts/${doc.slug}`}
        auto={one("auto") === "1"}
        orientation={one("orientation") === "portrait" ? "portrait" : "landscape"}
        captions={one("captions") === "1"}
        durations={durations?.length ? durations : undefined}
        cover={{
          title: doc.title,
          summary: doc.summary ?? undefined,
          site: site.name,
          date: date ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日` : undefined,
          url: site.url ?? undefined,
        }}
        slides={slides.map((s) => ({
          title: s.title,
          notes: s.notes,
          text: plainText(s.source).replace(/\s+/g, "").length,
          content: <Markdown body={s.source} blocks={doc.blocks} posts={doc.posts} traces={traces} />,
        }))}
      />
    </>
  );
}
