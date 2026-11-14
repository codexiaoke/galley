import { loadPublishedDocument, loadPublishedList } from "../data";
import { canReadNarration, NARRATION_CORS, narrationDenied, narrationPreflight } from "../narration-access";

/**
 * 可以拿去做视频的文章：所有已发布的文章，标出哪些写了讲稿。
 * 做视频的工具用它列出一个可选的清单，选中一篇再去读那一篇的 /posts/<别名>/narration.json。
 *
 * 和单篇的讲稿接口一样要认人（见 narration-access.ts）：哪篇写了讲稿、写了多少，也属于没公开的东西。
 */
export const OPTIONS = narrationPreflight;

export async function GET(request: Request) {
  if (!(await canReadNarration(request))) return narrationDenied();
  const list = await loadPublishedList();
  const articles = await Promise.all(
    list.map(async (item) => {
      const doc = await loadPublishedDocument(item.slug);
      const body = doc?.body ?? "";
      return {
        slug: item.slug,
        title: item.title,
        publishedAt: item.publishedAt,
        /** 写了讲稿的地方有几处：每一页的 :::notes，加上场景里每一步的 say。0 就是还没写讲稿 */
        narrated: (body.match(/^:::notes\b/gm)?.length ?? 0) + (body.match(/\bsay\s*\(/g)?.length ?? 0),
      };
    }),
  );
  return Response.json({ articles }, { headers: { ...NARRATION_CORS, "Cache-Control": "private, no-store" } });
}
