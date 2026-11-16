import { loadSite } from "../../../site";
import { loadPublishedDocument } from "../../../data";
import { presentationSource } from "../../../presentation-source";

/**
 * 演示结构：博客对视频工坊承诺的接口（见 docs/design-studio-split.md 的"演示结构接口"）。
 *
 * 和 narration.json 是同一份拍点清单，只是去掉了讲稿，所以公开、不要密钥：
 * 有哪些页、每页的场景步骤、画面上写给读者的那句话、动画至少放多久、能指向的元素，
 * 每一项都带按内容算的锚点；再加内容指纹 version 和结构指纹 structure。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [doc, site] = await Promise.all([loadPublishedDocument(slug), loadSite()]);
  if (!doc || doc.kind !== "article") return Response.json({ error: "没有这篇文章。" }, { status: 404 });
  const { version, structure, beats } = await presentationSource(doc, site);
  return Response.json(
    {
      slug: doc.slug,
      title: doc.title,
      revisedAt: doc.revisedAt,
      version,
      structure,
      present: `/posts/${doc.slug}/present`,
      beats: beats.map((beat) => ({ ...beat, text: undefined })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
