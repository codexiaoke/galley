import { runScenes } from "@/core/scene/run";
import { narrationBeats } from "@/render/narration";
import { presentationVersion } from "@/core/presentation-version";
import { loadSite } from "../../../site";
import { loadPublishedDocument } from "../../../data";
import { canReadNarration, NARRATION_CORS, narrationDenied, narrationPreflight } from "../../../narration-access";

/**
 * 一篇文章做成视频用的讲稿，按播放的顺序一拍一拍给出（见 render/narration.ts）。
 *
 * 给做视频的工具用：它拿每一拍的讲稿去配音，再把每一拍的时长通过演示页的 timing 参数传回来。
 *
 * 讲稿不公开（公开的幻灯片接口 present.json 里没有它），所以这个接口要认人，见 narration-access.ts。
 */
export const OPTIONS = narrationPreflight;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await canReadNarration(request))) return narrationDenied();
  const { slug } = await params;
  const [doc, site] = await Promise.all([loadPublishedDocument(slug), loadSite()]);
  if (!doc || doc.kind !== "article") return Response.json({ error: "没有这篇文章。" }, { status: 404, headers: NARRATION_CORS });
  const beats = narrationBeats(doc.body, await runScenes(doc.body));
  return Response.json(
    {
      slug: doc.slug,
      title: doc.title,
      revisedAt: doc.revisedAt,
      version: presentationVersion(doc, site),
      /** 演示页的地址。把每一拍的时长拼成 timing=名字:毫秒,名字:毫秒 加在后面 */
      present: `/posts/${doc.slug}/present`,
      beats,
    },
    { headers: { ...NARRATION_CORS, "Cache-Control": "private, no-store" } },
  );
}
