import { Boxes, Braces, Code2, Globe, Lightbulb, Lock, MessageSquareQuote, Route, Search, Table2, type LucideIcon } from "lucide-react";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { BLOCK_TYPES, type BlockType } from "@/core/db/schema";
import { listBlocks } from "@/core/services/blocks";
import { changeBlockVisibility, confirmBlock, flagBlockStale } from "../../actions";
import { requireOwner } from "../../auth";
import { Modal, ModalForm } from "../../modal";
import { Select } from "../../select";
import { Badge, buttonClass, Card, DetailRow, EmptyState, formatDay, IconTile, INPUT, PageHeader, PageSkeleton, PrimaryCell, RowActions, Table, type Tone } from "../../ui";

const TYPE: Record<BlockType, { label: string; icon: LucideIcon; tone: Tone }> = {
  fact: { label: "事实", icon: Lightbulb, tone: "blue" },
  concept: { label: "概念", icon: Braces, tone: "purple" },
  code: { label: "代码", icon: Code2, tone: "neutral" },
  data: { label: "数据", icon: Table2, tone: "green" },
  opinion: { label: "观点", icon: MessageSquareQuote, tone: "orange" },
  experience: { label: "经历", icon: Route, tone: "pink" },
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  verified: { label: "已核实", tone: "green" },
  stale: { label: "已过期", tone: "amber" },
  retired: { label: "已停用", tone: "neutral" },
  draft: { label: "待核实", tone: "neutral" },
};

export default function BlocksPage({ searchParams }: PageProps<"/admin/blocks">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Blocks searchParams={searchParams} />
    </Suspense>
  );
}

async function Blocks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const type = BLOCK_TYPES.find((t) => t === params.type);
  const blocks = listBlocks(getDb(), { q, type });
  const filtered = !!q || !!type;

  return (
    <>
      <PageHeader title="知识块" description="站里已经确认的事实、概念、代码、数据，以及你的观点和经历。文章引用的就是这些。" />

      <Card flush footer={`${filtered ? "符合条件的" : "共"} ${blocks.length} 个知识块`}>
        <form className="flex flex-wrap items-center gap-2 border-b border-a-border py-2.5">
          <div className="relative w-72 max-w-full">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-a-muted" />
            <input name="q" defaultValue={q} placeholder="搜索标题、内容或编号" className={`${INPUT} !pl-9`} />
          </div>
          <Select
            name="type"
            ariaLabel="类型"
            defaultValue={type ?? ""}
            options={[{ value: "", label: "全部类型" }, ...BLOCK_TYPES.map((t) => ({ value: t, label: TYPE[t].label }))]}
            className="w-36"
            submitOnChange
          />
          <button className={buttonClass("secondary")}>搜索</button>
          {filtered && (
            <a href="/admin/blocks" className="px-2 text-a-muted hover:text-a-text">
              清除条件
            </a>
          )}
        </form>

        <Table
          head={["知识块", "类型", "状态", "可见性", "被引用", "核实日期", ""]}
          empty={
            blocks.length === 0 ? (
              <EmptyState
                icon={filtered ? Search : Boxes}
                title={filtered ? "没有符合条件的知识块" : "还没有知识块"}
                hint={filtered ? "换个关键词，或者清除筛选条件试试。" : "Agent 整理出的知识块在看板上批准之后，会出现在这里。"}
              />
            ) : undefined
          }
        >
          {blocks.map((block) => {
            const status = STATUS[block.status];
            const kind = TYPE[block.type];
            return (
              <tr key={block.id}>
                <td className="max-w-sm">
                  <PrimaryCell leading={<IconTile icon={kind.icon} />} title={block.title} subtitle={block.id} />
                </td>
                <td>
                  <Badge tone={kind.tone}>{kind.label}</Badge>
                </td>
                <td>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </td>
                <td>
                  {block.visibility === "private" ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-a-danger">
                      <Lock size={14} />
                      私密
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-a-muted">
                      <Globe size={14} />
                      公开
                    </span>
                  )}
                </td>
                <td className="tabular-nums text-a-muted">{block.usageCount} 篇</td>
                <td className="tabular-nums text-a-muted">{formatDay(block.revisedAt)}</td>
                <td>
                  <RowActions>
                    <Modal triggerLabel="查看" title={block.title} wide>
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <Badge tone={kind.tone}>{kind.label}</Badge>
                        <Badge tone={status.tone} dot>
                          {status.label}
                        </Badge>
                        {block.visibility === "private" && <Badge tone="red">私密</Badge>}
                        <span className="font-mono text-xs text-a-muted">{block.id}</span>
                      </div>
                      <dl className="space-y-4">
                        <DetailRow label="内容">
                          <p className="whitespace-pre-wrap leading-relaxed">{block.body}</p>
                        </DetailRow>
                        {Object.keys(block.data).length > 0 && (
                          <DetailRow label="专有字段">
                            <pre className="overflow-x-auto rounded-lg bg-a-subtle p-3 font-mono text-xs">{JSON.stringify(block.data, null, 2)}</pre>
                          </DetailRow>
                        )}
                        <DetailRow label="来源">
                          {block.sources.length === 0 ? (
                            <span className="text-a-muted">{block.type === "opinion" || block.type === "experience" ? "来自站长本人" : "无"}</span>
                          ) : (
                            <ul className="space-y-1.5">
                              {block.sources.map((source, i) => (
                                <li key={i}>
                                  <a href={source.url} target="_blank" rel="noreferrer" className="break-all text-a-primary hover:underline">
                                    {source.title ?? source.url}
                                  </a>
                                  {source.quote && <span className="block text-a-muted">「{source.quote}」</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </DetailRow>
                        <DetailRow label="使用情况">
                          第 {block.revNo} 版，核实于 {formatDay(block.revisedAt)}，被 {block.usageCount} 篇文章引用
                        </DetailRow>
                      </dl>
                    </Modal>

                    {block.visibility === "public" ? (
                      <ModalForm
                        triggerLabel="设为私密"
                        triggerVariant="link"
                        title="把这个知识块设为私密？"
                        action={changeBlockVisibility}
                        hidden={{ id: block.id, visibility: "private" }}
                        submitLabel="设为私密"
                        successMessage="已设为私密"
                      >
                        <p>私密的知识块不能被公开文章引用。Agent 仍然可以读到它，读取会留下记录，供你审稿时参考。</p>
                        {block.usageCount > 0 && (
                          <p className="rounded-lg bg-a-warning-soft px-3 py-2 text-a-warning">
                            它正被 {block.usageCount} 篇已上线的文章引用。这些文章不会立刻变化，但下次修改时会因为引用了私密内容而无法通过。
                          </p>
                        )}
                      </ModalForm>
                    ) : (
                      <ModalForm
                        triggerLabel="设为公开"
                        triggerVariant="link"
                        title="把这个知识块设为公开？"
                        action={changeBlockVisibility}
                        hidden={{ id: block.id, visibility: "public" }}
                        submitLabel="设为公开"
                        successMessage="已设为公开"
                      >
                        <p>公开之后，Agent 可以在文章里引用它，内容可能出现在前台。</p>
                      </ModalForm>
                    )}

                    {block.status === "verified" && (
                      <ModalForm
                        triggerLabel="标记过期"
                        triggerVariant="linkDanger"
                        title="把这个知识块标记为过期？"
                        action={flagBlockStale}
                        hidden={{ id: block.id }}
                        submitLabel="标记过期"
                        submitVariant="danger"
                        successMessage="已标记为过期"
                      >
                        <p>表示它的内容可能已经不成立。Agent 的待办里会出现「核查并更新它」的任务，引用它的文章会在看板上标出。</p>
                      </ModalForm>
                    )}
                    {block.status === "stale" && (
                      <ModalForm
                        triggerLabel="确认仍然成立"
                        triggerVariant="link"
                        title="确认这个知识块仍然成立？"
                        action={confirmBlock}
                        hidden={{ id: block.id }}
                        submitLabel="确认"
                        successMessage="已恢复为已核实"
                      >
                        <p>它会恢复为「已核实」，引用它的文章不再被标为需要修订。</p>
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
