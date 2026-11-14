import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { GalleyError } from "@/core/errors";
import { listCategories } from "@/core/services/categories";
import { assertNotLockedElsewhere, findChangeSet } from "@/core/services/changeSets";
import { getDocumentForEditing, previewDocumentBody } from "@/core/services/documents";
import { prepareBody } from "@/core/prepare";
import { requireOwner } from "../../../../auth";
import { PageSkeleton } from "../../../../ui";
import { DocumentEditor } from "./editor";

export default function EditDocumentPage({ params, searchParams }: PageProps<"/admin/documents/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditDocument params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** 这篇文章现在改不了时显示的说明：告诉站长原因，以及该去哪里。 */
function Blocked({ title, children, href, linkLabel }: { title: string; children: React.ReactNode; href: string; linkLabel: string }) {
  return (
    <div className="max-w-xl">
      <h1 className="text-[1.35rem] font-semibold leading-tight tracking-tight">{title}</h1>
      <p className="mt-2 leading-relaxed text-a-muted">{children}</p>
      <Link href={href} className="mt-4 inline-flex items-center gap-1.5 text-a-primary hover:underline">
        <ArrowLeft size={15} />
        {linkLabel}
      </Link>
    </div>
  );
}

type Loaded =
  | { kind: "editor"; document: ReturnType<typeof getDocumentForEditing>; preview: ReturnType<typeof previewDocumentBody> & Awaited<ReturnType<typeof prepareBody>>; changeSetId?: string }
  /** 待审的改动已经不在待审状态了 */
  | { kind: "not-in-review"; changeSetId: string }
  /** 文章正在另一个还没结束的改动里 */
  | { kind: "locked"; title: string; other: { id: string; title: string } }
  | { kind: "missing" };

/** 读出要编辑的内容，并判断现在能不能改。只取数据，不拼界面。 */
async function load(id: string, changeSetId: string | undefined): Promise<Loaded> {
  const db = getDb();
  try {
    if (changeSetId) {
      // 在待审的改动里改稿：只有待审时可以，打回之后稿子在 Agent 手里。
      if (findChangeSet(db, changeSetId).status !== "in_review") return { kind: "not-in-review", changeSetId };
      const document = getDocumentForEditing(db, { documentId: id }, changeSetId);
      if (!document.isDraft) return { kind: "missing" };
      const prepared = await prepareBody(document.body);
      return { kind: "editor", document, changeSetId, preview: { ...previewDocumentBody(db, document.body, changeSetId), ...prepared } };
    }
    const document = getDocumentForEditing(db, { documentId: id });
    // 文章正在某个还没结束的改动里时，不能绕过它直接改，否则两边的修改会互相覆盖。
    try {
      assertNotLockedElsewhere(db, "", { documentId: id });
    } catch (e) {
      if (e instanceof GalleyError && e.code === "conflict") return { kind: "locked", title: document.title, other: e.details as { id: string; title: string } };
      throw e;
    }
    const prepared = await prepareBody(document.body);
    return { kind: "editor", document, preview: { ...previewDocumentBody(db, document.body), ...prepared } };
  } catch (e) {
    if (e instanceof GalleyError && e.code === "not_found") return { kind: "missing" };
    throw e;
  }
}

async function EditDocument({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const { id } = await params;
  const { cs } = await searchParams;
  const loaded = await load(id, typeof cs === "string" && cs ? cs : undefined);

  if (loaded.kind === "missing") notFound();
  if (loaded.kind === "not-in-review") {
    return (
      <Blocked title="这份稿子现在不能改" href={`/admin/change-sets/${loaded.changeSetId}`} linkLabel="返回这份改动">
        只有待审的改动可以直接改稿。它现在的状态不是待审：已经打回的在等 Agent 修改，已经批准的请到文章列表里修改。
      </Blocked>
    );
  }
  if (loaded.kind === "locked") {
    return (
      <Blocked title="这篇文章正在被修改" href={`/admin/change-sets/${loaded.other.id}`} linkLabel="打开那份改动">
        「{loaded.title}」在改动「{loaded.other.title}」里有一份还没结束的修改。请先处理那份改动（批准、打回，或者直接在里面改稿），再回来修改。
      </Blocked>
    );
  }
  return (
    <DocumentEditor
      document={{ ...loaded.document, id: loaded.document.documentId }}
      categories={listCategories(getDb())}
      changeSetId={loaded.changeSetId}
      backHref={loaded.changeSetId ? `/admin/change-sets/${loaded.changeSetId}` : "/admin/documents"}
      initialPreview={loaded.preview}
    />
  );
}
