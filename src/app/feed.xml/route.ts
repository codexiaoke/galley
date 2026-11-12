import { baseUrl, xml } from "../base-url";
import { loadPublishedList } from "../data";
import { loadSite } from "../site";

/** 订阅源里最多列出的文章数。 */
const LIMIT = 30;

/**
 * RSS 订阅源。每篇文章给出标题、摘要和链接，读者点进来看全文：
 * 正文里的依据、图表这些要在页面上才能完整显示。
 */
export async function GET(request: Request) {
  const [site, posts] = await Promise.all([loadSite(), loadPublishedList()]);
  const base = baseUrl(request, site);
  const items = posts.slice(0, LIMIT).map((post) => {
    const link = `${base}/posts/${post.slug}`;
    return [
      "<item>",
      `<title>${xml(post.title)}</title>`,
      `<link>${xml(link)}</link>`,
      `<guid isPermaLink="true">${xml(link)}</guid>`,
      post.publishedAt ? `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>` : "",
      post.summary ? `<description>${xml(post.summary)}</description>` : "",
      post.categoryName ? `<category>${xml(post.categoryName)}</category>` : "",
      site.author ? `<dc:creator>${xml(site.author)}</dc:creator>` : "",
      "</item>",
    ].join("");
  });
  const latest = posts[0]?.publishedAt;
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<channel>",
    `<title>${xml(site.name)}</title>`,
    `<link>${xml(base)}</link>`,
    `<description>${xml(site.description || site.name)}</description>`,
    "<language>zh-CN</language>",
    `<atom:link href="${xml(`${base}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    latest ? `<lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>` : "",
    ...items,
    "</channel>",
    "</rss>",
  ].join("");
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
