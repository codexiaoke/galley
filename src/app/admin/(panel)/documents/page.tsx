import { ExternalLink, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { listDocuments } from "@/core/services/documents";
import { setDocumentStatus } from "../../actions";
import { requireOwner } from "../../auth";
import { ModalForm } from "../../modal";
import { Badge, buttonClass, Card, EmptyState, formatDay, LetterTile, PageHeader, PageSkeleton, PrimaryCell, ROW_LINK, RowActions, Table, toneFor, type Tone } from "../../ui";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  published: { label: "已上线", tone: "green" },
  unpublished: { label: "已下线", tone: "amber" },
  draft: { label: "未批准", tone: "neutral" },
};

export default function DocumentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Documents />
    </Suspense>
  );
}

async function Documents() {
  await requireOwner();
  const documents = listDocuments(getDb());
  const online = documents.filter((d) => d.status === "published").length;
  const hasAbout = documents.some((d) => d.kind === "page" && d.slug === "about");
  /** 一篇文档在前台的网址：文章在 /posts/ 下面，页面直接在根下面。 */
  const urlOf = (doc: { kind: string; slug: string }) => (doc.kind === "page" ? `/${doc.slug}` : `/posts/${doc.slug}`);
  return (
    <>
      <PageHeader
        title="文章"
        description="全部文章和页面。Agent 的修改在看板上审阅；你也可以在这里自己写、直接编辑，或者把文章下线、重新上线。"
        actions={
          <>
            {!hasAbout && (
              <Link href="/admin/documents/new?kind=page" className={buttonClass("secondary")}>
                写「关于」页
              </Link>
            )}
            <Link href="/admin/documents/new" className={buttonClass("primary")}>
              <Plus size={16} />
              写文章
            </Link>
          </>
        }
      />
      <Card flush footer={documents.length > 0 ? `共 ${documents.length} 篇，其中 ${online} 篇已上线` : undefined}>
        <Table
          head={["标题", "分类", "状态", "版本", "发布日期", ""]}
          empty={documents.length === 0 ? <EmptyState icon={FileText} title="还没有文章" hint="Agent 提交的文章在看板上批准之后，会出现在这里。" /> : undefined}
        >
          {documents.map((doc) => {
            const status = STATUS[doc.status];
            return (
              <tr key={doc.id}>
                <td>
                  <PrimaryCell leading={<LetterTile />} title={doc.title} subtitle={urlOf(doc)} />
                </td>
                <td>
                  {doc.kind === "page" ? (
                    <Badge>页面</Badge>
                  ) : doc.categoryName ? (
                    <Badge tone={toneFor(doc.categoryName)}>{doc.categoryName}</Badge>
                  ) : (
                    <span className="text-a-muted">未分类</span>
                  )}
                </td>
                <td>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </td>
                <td className="tabular-nums text-a-muted">第 {doc.revNo} 版</td>
                <td className="tabular-nums text-a-muted">{formatDay(doc.publishedAt)}</td>
                <td>
                  <RowActions>
                    {doc.status !== "draft" && (
                      <Link href={`/admin/documents/${doc.id}/edit`} className={ROW_LINK}>
                        编辑
                      </Link>
                    )}
                    {doc.status === "published" && (
                      <>
                        <Link href={urlOf(doc)} target="_blank" className={ROW_LINK}>
                          查看
                          <ExternalLink size={13} />
                        </Link>
                        <ModalForm
                          triggerLabel="下线"
                          triggerVariant="linkDanger"
                          title="下线这篇文章？"
                          action={setDocumentStatus}
                          hidden={{ id: doc.id, published: "false" }}
                          submitLabel="下线"
                          submitVariant="danger"
                          successMessage="文章已下线"
                        >
                          <p>「{doc.title}」会立刻从前台消失，读者访问它的网址会看到「未找到」。内容和历史版本都会保留，之后可以重新上线。</p>
                        </ModalForm>
                      </>
                    )}
                    {doc.status === "unpublished" && (
                      <ModalForm
                        triggerLabel="重新上线"
                        triggerVariant="link"
                        title="重新上线这篇文章？"
                        action={setDocumentStatus}
                        hidden={{ id: doc.id, published: "true" }}
                        submitLabel="上线"
                        successMessage="文章已重新上线"
                      >
                        <p>「{doc.title}」会按下线前的内容重新出现在前台。</p>
                      </ModalForm>
                    )}
                    {doc.status === "draft" && (
                      <Link href="/admin" className={ROW_LINK}>
                        去看板审阅
                      </Link>
                    )}
                  </RowActions>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
