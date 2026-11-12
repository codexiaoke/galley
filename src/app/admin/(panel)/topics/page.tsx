import { ListTodo, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { TOPIC_STATUSES, type TopicStatus } from "@/core/db/schema";
import { listTopics, type Topic } from "@/core/services/topics";
import { decideOnTopic, saveTopic } from "../../actions";
import { requireOwner } from "../../auth";
import { ModalForm } from "../../modal";
import { Badge, Card, EmptyState, Field, FilterTabs, formatRelative, INPUT, PageHeader, PageSkeleton, ROW_LINK, RowActions, Table, type Tone } from "../../ui";

const STATUS: Record<TopicStatus, { label: string; tone: Tone }> = {
  proposed: { label: "候选", tone: "amber" },
  accepted: { label: "可以写", tone: "blue" },
  in_progress: { label: "在写", tone: "purple" },
  done: { label: "已写完", tone: "green" },
  dropped: { label: "不写", tone: "neutral" },
};

/** 还没有结果的选题。默认只看这些。 */
const OPEN: TopicStatus[] = ["proposed", "accepted", "in_progress"];

export default function TopicsPage({ searchParams }: PageProps<"/admin/topics">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Topics searchParams={searchParams} />
    </Suspense>
  );
}

function TopicFields({ topic }: { topic?: Topic }) {
  return (
    <>
      <Field label="标题">
        <input name="title" required defaultValue={topic?.title} placeholder="例如 为什么我不再用全局状态管理" className={INPUT} />
      </Field>
      <Field label="说明" hint="想从什么角度写、要讲清楚什么。Agent 写的时候会照着这个来。">
        <textarea name="note" rows={5} defaultValue={topic?.note} className={`${INPUT} resize-y leading-relaxed`} />
      </Field>
      <Field label="优先级" hint="数字大的先写。Agent 每一轮只写一篇。">
        <input name="priority" type="number" defaultValue={topic?.priority ?? 0} className={INPUT} />
      </Field>
    </>
  );
}

async function Topics({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const params = await searchParams;
  const all = listTopics(getDb());
  const active = TOPIC_STATUSES.find((s) => s === params.status) ?? "open";
  const order = (t: Topic) => OPEN.indexOf(t.status);
  // 默认的页签里，等你决定的候选排在最前面。
  const topics = active === "open" ? all.filter((t) => OPEN.includes(t.status)).sort((a, b) => order(a) - order(b)) : all.filter((t) => t.status === active);
  const count = (status: TopicStatus) => all.filter((t) => t.status === status).length;
  const now = new Date();
  const tab = (status: TopicStatus) => ({ key: status, label: STATUS[status].label, href: `/admin/topics?status=${status}`, count: count(status) });

  return (
    <>
      <PageHeader
        title="选题池"
        description="接下来要写什么。Agent 提出的是候选，你采纳之后它才会动笔；你自己加的选题直接可以写。"
        actions={
          <ModalForm
            triggerLabel={
              <>
                <Plus size={16} />
                新建选题
              </>
            }
            triggerVariant="primary"
            title="新建选题"
            action={saveTopic}
            submitLabel="新建"
            successMessage="选题已加入"
            wide
          >
            <TopicFields />
          </ModalForm>
        }
      />

      <Card flush footer={topics.length > 0 ? `${topics.length} 个选题` : undefined}>
        <FilterTabs
          active={active}
          tabs={[{ key: "open", label: "未完成", href: "/admin/topics" }, tab("proposed"), tab("accepted"), tab("in_progress"), tab("done"), tab("dropped")]}
        />
        <Table
          head={["选题", "状态", "优先级", "来自", "时间", ""]}
          empty={
            topics.length === 0 ? (
              <EmptyState
                icon={ListTodo}
                title={active === "open" ? "选题池是空的" : "这里没有选题"}
                hint={active === "open" ? "点右上角的「新建选题」加一个；Agent 整理素材时也会提出候选。" : "换一个页签看看。"}
              />
            ) : undefined
          }
        >
          {topics.map((topic) => {
            const status = STATUS[topic.status];
            return (
              <tr key={topic.id}>
                <td className="!min-w-64 !whitespace-normal">
                  <div className="font-medium text-a-text">{topic.title}</div>
                  {topic.note && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-a-muted">{topic.note}</p>}
                </td>
                <td>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </td>
                <td className="tabular-nums text-a-muted">{topic.priority}</td>
                <td className="whitespace-nowrap text-a-muted">{topic.createdByKind === "agent" ? "Agent 提出" : "你"}</td>
                <td className="whitespace-nowrap text-a-muted">{formatRelative(topic.createdAt, now)}</td>
                <td>
                  <RowActions>
                    {(topic.status === "proposed" || topic.status === "dropped") && (
                      <ModalForm
                        triggerLabel={topic.status === "proposed" ? "采纳" : "重新采纳"}
                        triggerVariant="link"
                        title="采纳这个选题？"
                        action={decideOnTopic}
                        hidden={{ id: topic.id, decision: "accept" }}
                        submitLabel="采纳"
                        successMessage="已采纳，Agent 下一轮可以写"
                      >
                        <p>「{topic.title}」会进入可写的队列，Agent 按优先级从高到低来写，每一轮写一篇。</p>
                      </ModalForm>
                    )}
                    {(topic.status === "in_progress" || topic.status === "done") && topic.changeSetId && (
                      <Link href={`/admin/change-sets/${topic.changeSetId}`} className={ROW_LINK}>
                        查看稿件
                      </Link>
                    )}
                    {topic.status !== "done" && topic.status !== "in_progress" && (
                      <ModalForm triggerLabel="编辑" triggerVariant="link" title="编辑选题" action={saveTopic} hidden={{ id: topic.id }} successMessage="选题已更新" wide>
                        <TopicFields topic={topic} />
                      </ModalForm>
                    )}
                    {(topic.status === "proposed" || topic.status === "accepted") && (
                      <ModalForm
                        triggerLabel="不写"
                        triggerVariant="linkDanger"
                        title="不写这个选题？"
                        action={decideOnTopic}
                        hidden={{ id: topic.id, decision: "drop" }}
                        submitLabel="不写"
                        submitVariant="danger"
                        successMessage="已标为不写"
                      >
                        <p>「{topic.title}」会移到「不写」里，Agent 不会再写它。之后改主意可以重新采纳。</p>
                      </ModalForm>
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
