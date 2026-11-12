import { baseUrl, xml } from "../base-url";
import { loadCategories, loadHasAboutPage, loadPublishedList } from "../data";
import { loadSite } from "../site";

const day = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);

/** 站点地图：首页、有文章的分类页、每一篇已发布的文章。 */
export async function GET(request: Request) {
  const [site, posts, categories, hasAbout] = await Promise.all([loadSite(), loadPublishedList(), loadCategories(), loadHasAboutPage()]);
  const base = baseUrl(request, site);
  const latest = day(posts.map((p) => p.revisedAt).sort((a, b) => b.getTime() - a.getTime())[0]);
  const entries: { loc: string; lastmod?: string }[] = [
    { loc: `${base}/`, lastmod: latest },
    ...(hasAbout ? [{ loc: `${base}/about` }] : []),
    ...categories.filter((c) => c.publishedCount > 0).map((c) => ({ loc: `${base}/category/${c.slug}` })),
    ...posts.map((p) => ({ loc: `${base}/posts/${p.slug}`, lastmod: day(p.revisedAt) })),
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) => `<url><loc>${xml(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`),
    "</urlset>",
  ].join("");
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
