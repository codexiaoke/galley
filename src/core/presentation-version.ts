import { createHash } from "node:crypto";
import type { StructureBeat } from "../contract/narration";
import type { RenderableDocument } from "./services/documents";

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * 内容指纹：文章、引用或站点显示变了就变。工坊据此判断来源有没有更新、要不要同步。
 */
export function presentationVersion(document: RenderableDocument, site: { name: string; url: string | null; theme: string }) {
  return sha256({ document, site: { name: site.name, url: site.url, theme: site.theme } });
}

/**
 * 结构指纹：演示里有哪些拍、每一拍画面上写什么、动画至少放多久、能指向哪些元素、各自的编号和锚点。
 * 不含建议时长（只是参考，工坊可以改）。
 *
 * 由拍点清单直接算出来，不用人记得加版本号：博客改了分页、场景、编号的规则，算出来的结构不一样，指纹自然就变了。
 * 工坊按它判断已经审过的讲稿还能不能直接用：结构没变，文章的字句或博客的代码变了也照常导出；结构变了才要同步。
 */
export function structureFingerprint(beats: StructureBeat[]) {
  // JSON 里 undefined 的字段不出现，等于去掉
  return sha256(beats.map((beat) => ({ ...beat, suggestedMs: undefined })));
}
