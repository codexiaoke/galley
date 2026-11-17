import { runScenes3D } from "@/core/scene3d/run";
import { runScenes } from "@/core/scene/run";
import { presentationVersion, structureFingerprint } from "@/core/presentation-version";
import type { RenderableDocument } from "@/core/services/documents";
import { presentationBeats } from "@/render/beats";

/**
 * 一篇文章的演示结构（给视频工坊用）：一拍一拍的清单，加上两个指纹。
 * - version：内容指纹，文章、引用、站点显示变了就变；
 * - structure：结构指纹，只看有哪些拍、画面上写什么、能指向什么（见 core/presentation-version.ts）。
 */
export async function presentationSource(doc: RenderableDocument & { body: string }, site: { name: string; url: string | null; theme: string }) {
  const [scenes, scenes3d] = await Promise.all([runScenes(doc.body), runScenes3D(doc.body)]);
  const beats = presentationBeats(doc.body, scenes, scenes3d);
  return { version: presentationVersion(doc, site), structure: structureFingerprint(beats), beats };
}
