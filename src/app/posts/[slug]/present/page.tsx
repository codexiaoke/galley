import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prepareRender } from "@/core/prepare";
import { Presentation } from "@/render/client/present";
import { parseTiming } from "@/render/beats";
import { presentSlides } from "@/render/present-slides";
import { loadPublishedDocument } from "../../../data";
import { loadSite } from "../../../site";
import { presentationSource } from "../../../presentation-source";

/**
 * 演示模式：文章变成全屏的幻灯片。
 *
 * 网址参数（录制视频的脚本会用到，平时不用管）：
 * - auto=1：自动播放
 * - controlled=1：等外层视频工坊收到 ready 后发 start，再从封面开始播放
 * - offline=1：本机逐帧导出，由渲染器控制时间，跳过原生视图过渡
 * - orientation=portrait：竖屏（9:16）
 * - captions=space：不显示字幕，但每一页在底部留出字幕的位置（字幕由视频工坊或后期加）。讲稿归视频工坊，博客不显示讲稿
 * - durations=3000,5200,…：每一页至少停留多少毫秒
 * - timing=p1:5200,p2:3000,1x9abc.0:4100,…：每一拍停多少毫秒。拍的名字从 structure.json 里来
 *   （页是 p<页码>，场景的步骤是 <场景的指纹>.<第几步>），细到场景的每一步，比 durations 准
 * - structure=<结构指纹>：视频工坊用。和 structure.json 里的对不上就返回 404，不放和讲稿对不上的画面
 * - print=1：所有页排好后打开打印对话框，存成 PDF
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
  // 工坊审查的是明确的来源。structure：结构指纹对不上（拍点、画面文字、可指元素变了）就不放，讲稿会对不上；
  // version：旧版工坊用的内容指纹，文章一改就不放。
  if (typeof query.structure === "string" || typeof query.version === "string") {
    const source = await presentationSource(doc, site);
    if ((typeof query.structure === "string" && query.structure !== source.structure) || (typeof query.version === "string" && query.version !== source.version)) notFound();
  }
  const prepared = await prepareRender(doc.body);
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
        controlled={one("controlled") === "1"}
        offline={one("offline") === "1"}
        orientation={one("orientation") === "portrait" ? "portrait" : one("orientation") === "landscape" ? "landscape" : undefined}
        captions={one("captions") === "space" ? "space" : "off"}
        durations={durations?.length ? durations : undefined}
        timing={parseTiming(one("timing"))}
        print={one("print") === "1"}
        cover={{
          title: doc.title,
          summary: doc.summary ?? undefined,
          site: site.name,
          date: date ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日` : undefined,
          url: site.url ?? undefined,
        }}
        slides={presentSlides(doc, prepared)}
      />
    </>
  );
}
