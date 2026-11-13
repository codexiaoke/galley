import { plainText } from "@/core/markup/text";
import type { TraceResult } from "@/core/algo/trace-shared";
import type { RenderableDocument } from "@/core/services/documents";
import { Markdown } from "./Markdown";
import { splitSlides } from "./slides";

/** 把一篇文章拆成演示用的幻灯片，每页的内容渲染好。前台的演示页和后台审阅时的预览共用。 */
export function presentSlides(doc: Pick<RenderableDocument, "body" | "blocks" | "posts">, traces: Record<string, TraceResult>) {
  return splitSlides(doc.body).map((s) => ({
    title: s.title,
    section: s.section,
    notes: s.notes,
    text: plainText(s.source).replace(/\s+/g, "").length,
    content: <Markdown body={s.source} blocks={doc.blocks} posts={doc.posts} traces={traces} />,
  }));
}
