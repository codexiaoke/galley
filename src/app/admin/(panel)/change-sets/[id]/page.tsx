import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { GalleyError } from "@/core/errors";
import { getBlockViewAtRevision } from "@/core/services/blocks";
import { changeSetContents } from "@/core/services/changeSets";
import { getDocumentRevision } from "@/core/services/documents";
import { Markdown } from "@/render/Markdown";
import { requireOwner } from "../../../auth";
import { DecisionForm } from "../../../forms";
import { Badge, Card, PageSkeleton, type Tone } from "../../../ui";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "进行中", tone: "neutral" },
  in_review: { label: "待审", tone: "blue" },
  approved: { label: "已上线", tone: "green" },
  rejected: { label: "已打回", tone: "amber" },
  withdrawn: { label: "已撤回", tone: "neutral" },
};

const TYPE_LABEL: Record<string, string> = { fact: "事实", concept: "概念", code: "代码", data: "数据", opinion: "观点", experience: "经历" };

export default function ChangeSetPage({ params }: PageProps<"/admin/change-sets/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChangeSetDetail params={params} />
    </Suspense>
  );
}

function load(id: string) {
  try {
    return changeSetContents(getDb(), id);
  } catch (e) {
    if (e instanceof GalleyError && e.code === "not_found") notFound();
    throw e;
  }
}

async function ChangeSetDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const db = getDb();
  const { changeSet, blockItems, documentItems, privateBlockIdsRead } = load(id);
  const status = STATUS[changeSet.status];

  return (
    <>
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-a-muted transition-colors hover:bg-a-subtle hover:text-a-text">
        <ArrowLeft size={15} />
        返回看板
      </Link>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.35rem] font-semibold leading-tight tracking-tight">{changeSet.title}</h1>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
        {changeSet.summary && <p className="mt-1 max-w-3xl text-a-muted">{changeSet.summary}</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {documentItems.map(({ document, revision }) => {
            const preview = getDocumentRevision(db, revision.id);
            return (
              <Card
                key={revision.id}
                title={`${document.kind === "page" ? "页面" : "文章"}：${revision.title}`}
                actions={<span className="text-xs text-a-muted">{revision.revNo === 1 ? "新建" : `修改为第 ${revision.revNo} 版`}</span>}
              >
                <dl className="mb-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[5rem_1fr]">
                  <dt className="text-a-muted">网址</dt>
                  <dd className="font-mono text-xs">/posts/{document.slug}</dd>
                  <dt className="text-a-muted">分类</dt>
                  <dd>{preview?.category ? preview.category.name : <span className="text-a-danger">未分类</span>}</dd>
                  {revision.summary && (
                    <>
                      <dt className="text-a-muted">摘要</dt>
                      <dd>{revision.summary}</dd>
                    </>
                  )}
                </dl>
                {/* 预览按前台的样子显示：纸张底色和宋体，和读者看到的一致 */}
                <div className="galley-site rounded-lg border border-a-border bg-paper px-6 py-7 text-ink sm:px-9">
                  {preview && <Markdown body={preview.body} blocks={preview.blocks} review />}
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-a-muted hover:text-a-text">查看正文源码</summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-a-subtle p-3 font-mono text-xs">{revision.body}</pre>
                </details>
              </Card>
            );
          })}

          {blockItems.length > 0 && (
            <Card title={`知识块（${blockItems.length}）`}>
              <ul className="space-y-4">
                {blockItems.map(({ block, revision }) => {
                  const previous =
                    block.currentRevisionId && block.currentRevisionId !== revision.id
                      ? getBlockViewAtRevision(db, block.currentRevisionId)
                      : undefined;
                  return (
                    <li key={revision.id} className="rounded-md border border-a-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="blue">{TYPE_LABEL[block.type]}</Badge>
                        <Badge>{revision.revNo === 1 ? "新建" : `更新为第 ${revision.revNo} 版`}</Badge>
                        {block.visibility === "private" && <Badge tone="red">私密</Badge>}
                        {!revision.semanticChange && <Badge tone="amber">声明不改变含义</Badge>}
                        <span className="font-mono text-xs text-a-muted">{block.id}</span>
                      </div>
                      <p className="mt-2 font-medium">{revision.title}</p>
                      {revision.reason && <p className="mt-1 text-a-muted">更新原因：{revision.reason}</p>}
                      {previous && previous.body !== revision.body && (
                        <p className="mt-3 whitespace-pre-wrap rounded-md bg-a-danger-soft p-2.5 line-through decoration-a-danger">{previous.body}</p>
                      )}
                      <p className={`mt-3 whitespace-pre-wrap leading-relaxed ${previous ? "rounded-md bg-a-success-soft p-2.5" : ""}`}>{revision.body}</p>
                      {Object.keys(revision.data).length > 0 && (
                        <pre className="mt-3 overflow-x-auto rounded-md bg-a-subtle p-2.5 font-mono text-xs">{JSON.stringify(revision.data, null, 2)}</pre>
                      )}
                      {revision.sources.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {revision.sources.map((source, i) => (
                            <li key={i}>
                              <span className="text-a-muted">来源：</span>
                              <a href={source.url} target="_blank" rel="noreferrer" className="break-all text-a-primary hover:underline">
                                {source.title ?? source.url}
                              </a>
                              {source.quote && <span className="block text-a-muted">「{source.quote}」</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
          <Card title="结论">
            {changeSet.status === "in_review" ? (
              <DecisionForm changeSetId={changeSet.id} />
            ) : (
              <p className="text-a-muted">当前状态是「{status.label}」，只有待审的改动可以批准或打回。</p>
            )}
          </Card>
          {changeSet.decisionNote && (
            <Card title="你上次的意见">
              <p className="whitespace-pre-wrap">{changeSet.decisionNote}</p>
            </Card>
          )}
          {privateBlockIdsRead.length > 0 && (
            <div className="rounded-lg border border-a-warning bg-a-warning-soft p-4 text-a-warning">
              <p className="font-medium">留意私密内容</p>
              <p className="mt-1">
                Agent 在准备这次改动时读取过私密知识块：{privateBlockIdsRead.join("、")}。请留意它们的内容是否被换了说法写进正文。
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
