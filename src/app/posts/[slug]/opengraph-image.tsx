import { notFound } from "next/navigation";
import { CARD, cardResponse } from "@/render/share-card";
import { loadPublishedDocument } from "../../data";
import { loadSite } from "../../site";

/** 文章的分享卡片：转发到别处时显示的那张图。版式见 render/share-card.ts。 */
export const size = CARD;
export const contentType = "image/png";
export const alt = "文章的分享卡片";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [doc, site] = await Promise.all([loadPublishedDocument(slug), loadSite()]);
  if (!doc || doc.kind !== "article") notFound();
  const date = doc.publishedAt ? new Date(doc.publishedAt) : null;
  return cardResponse({
    site: site.name,
    title: doc.title,
    summary: doc.summary || undefined,
    kicker: doc.series ? `系列 · ${doc.series}` : doc.category?.name,
    footer: date ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日` : undefined,
    url: site.url ? site.url.replace(/^https?:\/\//, "") : undefined,
  });
}
