import { createHash } from "node:crypto";
import type { RenderableDocument } from "./services/documents";

/** 讲稿读取和演示渲染使用同一指纹，文章、引用或站点显示改变时不能误用已审版本。 */
export function presentationVersion(document: RenderableDocument, site: { name: string; url: string | null; theme: string }) {
  return createHash("sha256").update(JSON.stringify({ presentation: 6, document, site: { name: site.name, url: site.url, theme: site.theme } })).digest("hex");
}
