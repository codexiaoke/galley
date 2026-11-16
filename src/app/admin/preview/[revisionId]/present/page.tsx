import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prepareRender } from "@/core/prepare";
import { getDb } from "@/core/db/client";
import { getDocumentRevision } from "@/core/services/documents";
import { Presentation } from "@/render/client/present";
import { presentSlides } from "@/render/present-slides";
import { requireOwner } from "../../../auth";

/**
 * 审阅时预览一版文章的演示效果：和前台的演示页一样，只是内容取自待审的这一版，
 * 站长批准之前就能看到它做成幻灯片是什么样子。不在后台的左侧菜单里，铺满整个窗口。
 */
export default function PreviewPresentPage({ params, searchParams }: PageProps<"/admin/preview/[revisionId]/present">) {
  return (
    <Suspense fallback={null}>
      <Preview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({ params, searchParams }: { params: Promise<{ revisionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const { revisionId } = await params;
  const query = await searchParams;
  const doc = getDocumentRevision(getDb(), revisionId);
  if (!doc || doc.kind !== "article") notFound();
  const prepared = await prepareRender(doc.body);
  const back = typeof query.from === "string" && /^[a-z0-9]+$/i.test(query.from) ? `/admin/change-sets/${query.from}` : "/admin";

  return (
    <>
      <title>{`${doc.title} · 演示预览`}</title>
      <Presentation backHref={back} print={query.print === "1"} orientation={query.orientation === "portrait" ? "portrait" : "landscape"} cover={{ title: doc.title, summary: doc.summary || undefined, site: "演示预览（还没有上线）" }} slides={presentSlides(doc, prepared)} />
    </>
  );
}
