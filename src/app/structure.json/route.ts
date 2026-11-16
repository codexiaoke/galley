import { loadPublishedList } from "../data";

/**
 * 可以拿去做视频的文章：所有已发布的文章。视频工坊用它列出可选的清单，
 * 选中一篇再去读那一篇的 /posts/<别名>/structure.json。都是公开的信息，不要密钥。
 */
export async function GET() {
  const list = await loadPublishedList();
  return Response.json(
    { articles: list.map((item) => ({ slug: item.slug, title: item.title, publishedAt: item.publishedAt })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
