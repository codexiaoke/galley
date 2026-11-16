import { plainText } from "@/core/markup/text";
import type { prepareRender } from "@/core/prepare";
import type { RenderableDocument } from "@/core/services/documents";
import { Markdown } from "./Markdown";
import { splitSlides } from "./slides";

/**
 * 把一篇文章拆成演示用的幻灯片，每页的内容渲染好。前台的演示页和后台审阅时的预览共用。
 *
 * 讲稿（每页的 :::notes、场景里的 say）不公开：只有 narration 为真时才放进页面数据，
 * 前台演示页只在站长登录时打开它，其余访客拿到的页面里没有讲稿。
 */
export function presentSlides(doc: Pick<RenderableDocument, "body" | "blocks" | "posts">, prepared: Awaited<ReturnType<typeof prepareRender>>, { narration = false }: { narration?: boolean } = {}) {
  return splitSlides(doc.body).map((s, i) => ({
    title: s.title,
    section: s.section,
    notes: narration ? s.notes : "",
    text: plainText(s.source).replace(/\s+/g, "").length,
    content: <Markdown body={s.source} blocks={doc.blocks} posts={doc.posts} traces={prepared.traces} scenes={prepared.scenes} narration={narration} guidePage={i + 1} />,
  }));
}
