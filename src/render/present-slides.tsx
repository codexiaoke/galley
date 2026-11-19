import { plainText } from "@/core/markup/text";
import type { prepareRender } from "@/core/prepare";
import type { RenderableDocument } from "@/core/services/documents";
import { Markdown } from "./Markdown";
import { splitSlides } from "./slides";
import { readScene3DSlide } from "./scene3d-source";

/**
 * 把一篇文章拆成演示用的幻灯片，每页的内容渲染好。前台的演示页和后台审阅时的预览共用。
 * 讲稿归视频工坊，演示页里没有讲稿。
 */
export function presentSlides(doc: Pick<RenderableDocument, "body" | "blocks" | "posts">, prepared: Awaited<ReturnType<typeof prepareRender>>) {
  return splitSlides(doc.body).map((s, i) => {
    const scene3d = readScene3DSlide(s.source, prepared.scenes3d);
    return {
      title: s.title,
      section: s.section,
      text: scene3d ? 0 : plainText(s.source).replace(/\s+/g, "").length,
      scene3d: scene3d ?? undefined,
      content: scene3d ? null : <Markdown body={s.source} blocks={doc.blocks} posts={doc.posts} traces={prepared.traces} scenes={prepared.scenes} scenes3d={prepared.scenes3d} guidePage={i + 1} />,
    };
  });
}
