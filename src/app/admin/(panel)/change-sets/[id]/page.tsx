import { ArrowLeft, PencilLine } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { GalleyError } from "@/core/errors";
import { getBlockViewAtRevision } from "@/core/services/blocks";
import { changeSetContents } from "@/core/services/changeSets";
import { listComments } from "@/core/services/comments";
import { getDocumentRevision } from "@/core/services/documents";
import { Markdown } from "@/render/Markdown";
import { changeReviewComment, saveBlockEdit, toggleLogEntry } from "../../../actions";
import { QuickAction } from "../../../quick-action";
import { requireOwner } from "../../../auth";
import { DiffView, diffSummary } from "../../../diff";
import { DecisionForm } from "../../../forms";
import { ModalForm } from "../../../modal";
import { Badge, Card, Field, formatRelative, INPUT, PageSkeleton, ROW_LINK, type Tone } from "../../../ui";
import { Commentable, CommentAction, CommentQuote } from "./comments";

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

/**
 * 一版内容相对"上一版"的改动，折叠起来放在预览下面。
 * 上一版有两种：被打回后重新提交的，对比上次打回时的内容；修改已上线内容的，对比线上的版本。
 */
function Changes({ label, before, after }: { label: string; before: string; after: string }) {
  const summary = diffSummary(before, after);
  if (!summary) return null;
  return (
    <details className="mt-4" open>
      <summary className="cursor-pointer text-a-muted hover:text-a-text">
        {label}
        <span className="ml-2 text-xs">{summary}</span>
      </summary>
      <div className="mt-2 rounded-md border border-a-border p-3">
        <DiffView before={before} after={after} />
      </div>
    </details>
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
  const comments = listComments(db, id);
  const openComments = comments.filter((c) => c.status === "open").length;
  const commentsOn = (revisionId: string) => comments.filter((c) => c.targetRevisionId === revisionId);
  // 只有待审的改动可以写批注、直接改稿。打回之后稿子在 Agent 手里。
  const inReview = changeSet.status === "in_review";
  const now = new Date();

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
            const online =
              document.currentRevisionId && document.currentRevisionId !== revision.id ? getDocumentRevision(db, document.currentRevisionId) : undefined;
            return (
              <Card
                key={revision.id}
                title={`${document.kind === "page" ? "页面" : "文章"}：${revision.title}`}
                actions={
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-a-muted">{revision.revNo === 1 ? "新建" : `修改为第 ${revision.revNo} 版`}</span>
                    {inReview && (
                      <Link href={`/admin/documents/${document.id}/edit?cs=${changeSet.id}`} className={ROW_LINK}>
                        <PencilLine size={13} />
                        直接改稿
                      </Link>
                    )}
                  </span>
                }
              >
                <dl className="mb-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[5rem_1fr]">
                  <dt className="text-a-muted">网址</dt>
                  <dd className="font-mono text-xs">/posts/{document.slug}</dd>
                  <dt className="text-a-muted">分类</dt>
                  <dd>{preview?.category ? preview.category.name : <span className="text-a-danger">未分类</span>}</dd>
                  {document.kind === "article" && (
                    <>
                      <dt className="text-a-muted">标签</dt>
                      <dd>{revision.tags.length > 0 ? revision.tags.join("、") : <span className="text-a-muted">没有</span>}</dd>
                    </>
                  )}
                  {revision.summary && (
                    <>
                      <dt className="text-a-muted">摘要</dt>
                      <dd>{revision.summary}</dd>
                    </>
                  )}
                </dl>
                {inReview && <p className="mb-2 text-xs text-a-muted">选中一段文字可以写批注；打回时批注会一起交给 Agent，它要逐条回复才能重新提交。</p>}
                {/* 预览按前台的样子显示：纸张底色和宋体，和读者看到的一致 */}
                <div className="galley-site rounded-lg border border-a-border bg-paper px-6 py-7 text-ink sm:px-9">
                  {preview && (
                    <Commentable changeSetId={changeSet.id} targetType="document" targetRevisionId={revision.id} comments={commentsOn(revision.id)} enabled={inReview}>
                      <Markdown body={preview.body} blocks={preview.blocks} review />
                    </Commentable>
                  )}
                </div>
                {revision.rejectedBody !== null ? (
                  <Changes label="相对上次打回时的改动" before={revision.rejectedBody} after={revision.body} />
                ) : (
                  online && <Changes label="相对线上版本的改动" before={online.body} after={revision.body} />
                )}
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
                        {inReview && (
                          <span className="ml-auto">
                            <ModalForm
                              triggerLabel="直接修改"
                              triggerVariant="link"
                              title="修改这个知识块"
                              action={saveBlockEdit}
                              hidden={{ id: block.id, cs: changeSet.id }}
                              successMessage="已保存到这份改动里"
                              wide
                            >
                              <Field label="标题">
                                <input name="title" required defaultValue={revision.title} className={INPUT} />
                              </Field>
                              <Field label="内容" hint="修改会保存到这份待审的改动里，你批准之后才生效。">
                                <textarea name="body" required rows={7} defaultValue={revision.body} className={`${INPUT} resize-y leading-relaxed`} />
                              </Field>
                            </ModalForm>
                          </span>
                        )}
                      </div>
                      <p className="mt-2 font-medium">{revision.title}</p>
                      {revision.reason && <p className="mt-1 text-a-muted">更新原因：{revision.reason}</p>}
                      <Commentable changeSetId={changeSet.id} targetType="block" targetRevisionId={revision.id} comments={commentsOn(revision.id)} enabled={inReview}>
                        <p className="mt-3 whitespace-pre-wrap leading-relaxed">{revision.body}</p>
                      </Commentable>
                      {revision.rejectedBody !== null ? (
                        <Changes label="相对上次打回时的改动" before={revision.rejectedBody} after={revision.body} />
                      ) : (
                        previous && <Changes label="相对现在生效的版本的改动" before={previous.body} after={revision.body} />
                      )}
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
            {inReview ? (
              <>
                <DecisionForm changeSetId={changeSet.id} openComments={openComments} />
                {changeSet.createdByKind === "agent" && (
                  <p className="mt-3 text-xs leading-relaxed text-a-muted">批准后，这项改动的标题和说明会出现在公开的运营日志里。说明里有不想公开的内容，可以批准后在这里把它隐藏。</p>
                )}
              </>
            ) : (
              <p className="text-a-muted">当前状态是「{status.label}」，只有待审的改动可以批准或打回。</p>
            )}
            {changeSet.status === "approved" && changeSet.createdByKind === "agent" && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-a-border pt-3 text-xs text-a-muted">
                <span>{changeSet.hiddenFromLog ? "没有出现在运营日志里" : "出现在公开的运营日志里"}</span>
                <QuickAction
                  action={toggleLogEntry}
                  fields={{ id: changeSet.id, hidden: changeSet.hiddenFromLog ? "false" : "true" }}
                  successMessage={changeSet.hiddenFromLog ? "已在运营日志里恢复显示" : "已从运营日志里隐藏"}
                >
                  {changeSet.hiddenFromLog ? "恢复显示" : "从日志里隐藏"}
                </QuickAction>
              </div>
            )}
          </Card>
          {comments.length > 0 && (
            <Card title={`批注（${comments.length}）`}>
              <ul className="space-y-4">
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge tone={comment.status === "open" ? "amber" : "green"}>{comment.status === "open" ? "待处理" : "已处理"}</Badge>
                      <span className="truncate text-xs text-a-muted">
                        {comment.target?.type === "block" ? "知识块" : "正文"} · {formatRelative(comment.createdAt, now)}
                      </span>
                    </div>
                    {comment.anchor && <CommentQuote id={comment.id}>{comment.anchor.exact}</CommentQuote>}
                    <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                    {comment.reply && (
                      <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-a-subtle px-2.5 py-2 text-xs leading-relaxed">
                        <span className="text-a-muted">Agent 的回复：</span>
                        {comment.reply}
                      </p>
                    )}
                    <div className="-ml-1.5 mt-1 flex items-center gap-0.5">
                      {comment.status === "resolved" ? (
                        <CommentAction id={comment.id} op="reopen" successMessage="批注已重新打开">
                          没改到位，重新打开
                        </CommentAction>
                      ) : (
                        <CommentAction id={comment.id} op="resolve" successMessage="批注已标为处理完">
                          标为已处理
                        </CommentAction>
                      )}
                      <ModalForm
                        triggerLabel="删除"
                        triggerVariant="linkDanger"
                        title="删除这条批注？"
                        action={changeReviewComment}
                        hidden={{ id: comment.id, op: "delete" }}
                        submitLabel="删除"
                        submitVariant="danger"
                        successMessage="批注已删除"
                      >
                        <p>这条批注和 Agent 对它的回复会被永久删除。</p>
                      </ModalForm>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
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
