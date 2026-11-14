import { publicSlideSource, splitSlides } from "@/render/slides";
import { loadPublishedDocument } from "../../../data";

/**
 * 一篇文章拆成的幻灯片，JSON 形式。演示页（present）的内容，给程序读。
 *
 * 做这个接口是为了别的工具能拿到拆页的结果：拆页规则（每个二级标题一页、`---` 分页、
 * 一个大块一页）只在 Galley 这边，外部工具自己重写一份迟早会和这里跑偏。
 * 返回的东西刻意只有序号、标题和这一页的正文：讲稿、配音、视频都不是 Galley 的事。
 *
 * 不返回 `:::notes`，也不返回场景动画里每一步的讲稿（say）。它们是演讲时作者自己说的话，
 * 页面上不显示给读者，放进一个公开的接口等于把它公开了。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await loadPublishedDocument(slug);
  if (!doc || doc.kind !== "article") {
    return Response.json({ error: "没有这篇文章。" }, { status: 404 });
  }
  const slides = splitSlides(doc.body).map((slide, index) => ({
    index,
    title: slide.title ?? null,
    /** 这一页属于哪一节。接着上一页往下讲时，标题在上一页，这里给出它所属的小节 */
    section: slide.section ?? null,
    /** 这一页的正文，Markdown 原文，保留引用标记和组件 */
    source: publicSlideSource(slide.source),
  }));
  return Response.json(
    {
      slug: doc.slug,
      title: doc.title,
      summary: doc.summary,
      publishedAt: doc.publishedAt,
      revisedAt: doc.revisedAt,
      slides,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
