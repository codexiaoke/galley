import { CARD, cardResponse } from "@/render/share-card";
import { loadSite } from "./site";

/** 首页和其他页面的分享卡片：站名和一句话介绍。文章页有自己的（posts/[slug]/opengraph-image.tsx）。 */
export const size = CARD;
export const contentType = "image/png";
export const alt = "网站的分享卡片";

export default async function Image() {
  const site = await loadSite();
  return cardResponse({
    // 左上角的小字不再写一遍站名：写作者，没填作者时写"博客"
    site: site.author && site.author !== site.name ? site.author : "博客",
    title: site.name,
    summary: site.description || undefined,
    url: site.url ? site.url.replace(/^https?:\/\//, "") : undefined,
  });
}
