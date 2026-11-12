import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { OWNER } from "@/core/actor";
import { getDb } from "@/core/db/client";
import { listMessages } from "@/core/services/messages";
import { changeMessage } from "../../actions";
import { requireOwner } from "../../auth";
import { Modal, ModalForm } from "../../modal";
import { QuickAction } from "../../quick-action";
import { Badge, Card, DetailRow, EmptyState, FilterTabs, formatRelative, formatTime, PageHeader, PageSkeleton, RowActions, Table } from "../../ui";

export default function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Messages searchParams={searchParams} />
    </Suspense>
  );
}

async function Messages({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const { status } = await searchParams;
  const all = listMessages(getDb(), OWNER);
  const unread = all.filter((m) => m.status === "new");
  const active = status === "read" ? "read" : status === "all" ? "all" : "new";
  const messages = active === "new" ? unread : active === "read" ? all.filter((m) => m.status !== "new") : all;
  const now = new Date();

  return (
    <>
      <PageHeader title="留言" description="读者在前台写给你的话。只有你能看到，前台不展示，Agent 也读不到。" />
      <Card flush footer={messages.length > 0 ? `${messages.length} 条留言` : undefined}>
        <FilterTabs
          active={active}
          tabs={[
            { key: "new", label: "未读", href: "/admin/messages", count: unread.length },
            { key: "read", label: "已读", href: "/admin/messages?status=read", count: all.length - unread.length },
            { key: "all", label: "全部", href: "/admin/messages?status=all" },
          ]}
        />
        <Table
          head={["留言", "来自", "时间", ""]}
          empty={
            messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={active === "new" ? "没有未读的留言" : "这里没有留言"}
                hint={active === "new" ? "读者在前台页面底部点「留言」写下的话，会出现在这里。" : "换一个页签看看。"}
              />
            ) : undefined
          }
        >
          {messages.map((message) => (
            <tr key={message.id}>
              <td className="!min-w-64 !whitespace-normal">
                <p className={`line-clamp-2 leading-relaxed ${message.status === "new" ? "font-medium text-a-text" : "text-a-text"}`}>{message.body}</p>
              </td>
              <td>
                <div className="max-w-48 truncate">{message.name || <span className="text-a-muted">没有署名</span>}</div>
                {message.contact && <div className="max-w-48 truncate text-xs text-a-muted">{message.contact}</div>}
              </td>
              <td className="text-a-muted" title={formatTime(message.createdAt)}>
                {formatRelative(message.createdAt, now)}
              </td>
              <td>
                <RowActions>
                  <Modal triggerLabel="查看" title="留言" wide>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Badge tone={message.status === "new" ? "blue" : "neutral"}>{message.status === "new" ? "未读" : "已读"}</Badge>
                      <span className="text-xs text-a-muted">{formatTime(message.createdAt)}</span>
                    </div>
                    <dl className="space-y-4">
                      <DetailRow label="内容">
                        {/* 留言是陌生人写的任意文字，只当作纯文字显示 */}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                      </DetailRow>
                      <DetailRow label="署名">{message.name || <span className="text-a-muted">没有填</span>}</DetailRow>
                      <DetailRow label="联系方式">{message.contact ? <span className="break-all select-all">{message.contact}</span> : <span className="text-a-muted">没有填</span>}</DetailRow>
                      {message.fromPath && (
                        <DetailRow label="从哪一页来">
                          <Link href={message.fromPath} target="_blank" className="break-all text-a-primary hover:underline">
                            {message.fromPath}
                          </Link>
                        </DetailRow>
                      )}
                    </dl>
                  </Modal>
                  {message.status === "new" ? (
                    <QuickAction action={changeMessage} fields={{ id: message.id, op: "read" }} successMessage="已标为已读">
                      标为已读
                    </QuickAction>
                  ) : (
                    <QuickAction action={changeMessage} fields={{ id: message.id, op: "unread" }} successMessage="已标回未读">
                      标回未读
                    </QuickAction>
                  )}
                  <ModalForm
                    triggerLabel="删除"
                    triggerVariant="linkDanger"
                    title="删除这条留言？"
                    action={changeMessage}
                    hidden={{ id: message.id, op: "delete" }}
                    submitLabel="删除"
                    submitVariant="danger"
                    successMessage="留言已删除"
                  >
                    <p>这条留言会被永久删除，无法恢复。</p>
                  </ModalForm>
                </RowActions>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
