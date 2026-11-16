import { createHash } from "node:crypto";
import type { RenderableDocument } from "./services/documents";

/**
 * 讲稿读取和演示渲染使用同一指纹，文章、引用或站点显示改变时不能误用已审版本。
 * 改了讲稿的生成规则（拍点、时长）或演示的画法时，把 presentation 加一：文章没变，工坊也要能同步到新规则。
 */
export function presentationVersion(document: RenderableDocument, site: { name: string; url: string | null; theme: string }) {
  return createHash("sha256").update(JSON.stringify({ presentation: 9, document, site: { name: site.name, url: site.url, theme: site.theme } })).digest("hex");
}
