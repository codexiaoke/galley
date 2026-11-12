import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { listCategories } from "@/core/services/categories";
import { listDocuments } from "@/core/services/documents";
import { requireOwner } from "../../../auth";
import { PageSkeleton } from "../../../ui";
import { DocumentEditor } from "../[id]/edit/editor";

/**
 * 站长自己写一篇文章，或者写"关于"页。
 * 网址里带 ?kind=page 时写的是"关于"页：前台目前只有这一个页面，所以它的网址别名固定是 about。
 */
export default function NewDocumentPage({ searchParams }: PageProps<"/admin/documents/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewDocument searchParams={searchParams} />
    </Suspense>
  );
}

async function NewDocument({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const { kind } = await searchParams;
  const db = getDb();
  const isPage = kind === "page";
  if (isPage) {
    // "关于"页已经有了就直接去编辑它，不能再建一个。
    const existing = listDocuments(db).find((d) => d.kind === "page" && d.slug === "about");
    if (existing) redirect(`/admin/documents/${existing.id}/edit`);
  }
  return (
    <DocumentEditor
      isNew
      document={{ id: "", slug: isPage ? "about" : "", kind: isPage ? "page" : "article", title: isPage ? "关于" : "", summary: "", category: null, tags: [], body: "", revNo: 0 }}
      categories={listCategories(db)}
      backHref="/admin/documents"
      initialPreview={{ issues: [], blocks: {} }}
    />
  );
}
