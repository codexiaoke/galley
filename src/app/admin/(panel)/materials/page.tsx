import { Inbox, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { MATERIAL_STATUSES, type MaterialStatus } from "@/core/db/schema";
import { listMaterials, materialOutputs } from "@/core/services/materials";
import { changeMaterialStatus, removeMaterial, saveMaterial } from "../../actions";
import { requireOwner } from "../../auth";
import { FilterTabs } from "../../filter-tabs";
import { Modal, ModalForm } from "../../modal";
import { Select } from "../../select";
import { Badge, Card, DetailRow, EmptyState, Field, formatRelative, INPUT, PageHeader, PageSkeleton, RowActions, Table, type Tone } from "../../ui";

const STATUS: Record<MaterialStatus, { label: string; tone: Tone }> = {
  new: { label: "未处理", tone: "blue" },
  processed: { label: "已整理", tone: "green" },
  archived: { label: "已归档", tone: "neutral" },
};

const TOPIC_STATUS: Record<string, string> = { proposed: "候选", accepted: "已采纳", in_progress: "在写", done: "已写完", dropped: "不写" };

export default function MaterialsPage({ searchParams }: PageProps<"/admin/materials">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Materials searchParams={searchParams} />
    </Suspense>
  );
}

async function Materials({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const params = await searchParams;
  const db = getDb();
  const all = listMaterials(db);
  const active = MATERIAL_STATUSES.find((s) => s === params.status) ?? "all";
  const materials = active === "all" ? all.filter((m) => m.status !== "archived") : all.filter((m) => m.status === active);
  const count = (status: MaterialStatus) => all.filter((m) => m.status === status).length;
  const now = new Date();

  return (
    <>
      <PageHeader
        title="素材箱"
        description="随手记下的想法、经历和踩过的坑。Agent 会把它们整理成知识块和候选选题，文章里你的观点都从这里来。"
        actions={
          <ModalForm
            triggerLabel={
              <>
                <Plus size={16} />
                记一条素材
              </>
            }
            triggerVariant="primary"
            title="记一条素材"
            action={saveMaterial}
            submitLabel="放进素材箱"
            successMessage="已放进素材箱"
            wide
          >
            <Field label="内容" hint="想到什么写什么，不用整理。写清楚背景和你的结论，Agent 只会用你写下的内容，不会替你补充。">
              <textarea name="content" required rows={7} placeholder="例如：今天排查了一个缓存不刷新的问题，原因是……我的结论是……" className={`${INPUT} resize-y leading-relaxed`} />
            </Field>
            <Field label="相关链接" hint="可以不填。">
              <input name="url" type="url" placeholder="https://" className={INPUT} />
            </Field>
            <Field label="能不能公开" hint="私密素材整理出的知识块也是私密的，不会出现在任何公开的文章里。">
              <Select
                name="isPrivate"
                defaultValue="false"
                options={[
                  { value: "false", label: "可以用在公开的文章里" },
                  { value: "true", label: "私密，只给 Agent 做参考" },
                ]}
              />
            </Field>
          </ModalForm>
        }
      />

      <Card flush footer={materials.length > 0 ? `${materials.length} 条素材` : undefined}>
        <FilterTabs
          active={active}
          tabs={[
            { key: "all", label: "全部", href: "/admin/materials" },
            { key: "new", label: "未处理", href: "/admin/materials?status=new", count: count("new") },
            { key: "processed", label: "已整理", href: "/admin/materials?status=processed", count: count("processed") },
            { key: "archived", label: "已归档", href: "/admin/materials?status=archived", count: count("archived") },
          ]}
        />
        <Table
          head={["素材", "状态", "整理出", "记录", ""]}
          empty={
            materials.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={active === "all" ? "素材箱是空的" : "这里没有素材"}
                hint={active === "all" ? "点右上角的「记一条素材」，或者让 Agent 替你把工作里的收获记进来。" : "换一个页签看看。"}
              />
            ) : undefined
          }
        >
          {materials.map((material) => {
            const status = STATUS[material.status];
            const outputs = materialOutputs(db, material.id);
            const hasOutputs = material.blockCount + material.topicCount > 0;
            return (
              <tr key={material.id}>
                <td className="!min-w-64 !whitespace-normal">
                  <p className="line-clamp-2 leading-relaxed text-a-text">{material.content}</p>
                  {material.url && (
                    <a href={material.url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-a-muted hover:text-a-primary">
                      {material.url}
                    </a>
                  )}
                </td>
                <td>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                    {material.isPrivate && (
                      <span className="inline-flex items-center gap-1 text-xs text-a-danger">
                        <Lock size={12} />
                        私密
                      </span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap text-a-muted">
                  {hasOutputs
                    ? [material.blockCount > 0 && `${material.blockCount} 个知识块`, material.topicCount > 0 && `${material.topicCount} 个选题`].filter(Boolean).join("，")
                    : "—"}
                </td>
                <td className="whitespace-nowrap text-a-muted">
                  {formatRelative(material.createdAt, now)}
                  {material.createdByKind === "agent" && "，Agent 代记"}
                </td>
                <td>
                  <RowActions>
                    <Modal triggerLabel="查看" title="素材" wide>
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <Badge tone={status.tone} dot>
                          {status.label}
                        </Badge>
                        {material.isPrivate && <Badge tone="red">私密</Badge>}
                        <span className="font-mono text-xs text-a-muted">{material.id}</span>
                      </div>
                      <dl className="space-y-4">
                        <DetailRow label="内容">
                          <p className="whitespace-pre-wrap leading-relaxed">{material.content}</p>
                        </DetailRow>
                        {material.url && (
                          <DetailRow label="链接">
                            <a href={material.url} target="_blank" rel="noreferrer" className="break-all text-a-primary hover:underline">
                              {material.url}
                            </a>
                          </DetailRow>
                        )}
                        {material.processedNote && (
                          <DetailRow label="Agent 的说明">
                            <p className="whitespace-pre-wrap leading-relaxed">{material.processedNote}</p>
                          </DetailRow>
                        )}
                        {outputs.blocks.length > 0 && (
                          <DetailRow label="知识块">
                            <ul className="space-y-1.5">
                              {outputs.blocks.map((block) => (
                                <li key={block.id}>
                                  {/* 还没批准的知识块不在知识块列表里，要到看板上审阅 */}
                                  {block.status === "draft" ? (
                                    <>
                                      {block.title}
                                      <Link href="/admin" className="ml-2 text-xs text-a-primary hover:underline">
                                        待你在看板上核实
                                      </Link>
                                    </>
                                  ) : (
                                    <Link href={`/admin/blocks?q=${block.id}`} className="text-a-primary hover:underline">
                                      {block.title}
                                    </Link>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </DetailRow>
                        )}
                        {outputs.topics.length > 0 && (
                          <DetailRow label="选题">
                            <ul className="space-y-1.5">
                              {outputs.topics.map((topic) => (
                                <li key={topic.id}>
                                  {topic.title}
                                  <span className="ml-2 text-xs text-a-muted">{TOPIC_STATUS[topic.status]}</span>
                                </li>
                              ))}
                            </ul>
                          </DetailRow>
                        )}
                      </dl>
                    </Modal>
                    {material.status === "archived" ? (
                      <ModalForm
                        triggerLabel="放回"
                        triggerVariant="link"
                        title="把这条素材放回未处理？"
                        action={changeMaterialStatus}
                        hidden={{ id: material.id, status: "new" }}
                        submitLabel="放回"
                        successMessage="已放回未处理"
                      >
                        <p>它会重新出现在 Agent 的待办里，下一轮运营时被整理。</p>
                      </ModalForm>
                    ) : (
                      <>
                        {material.status === "processed" && (
                          <ModalForm
                            triggerLabel="重新整理"
                            triggerVariant="link"
                            title="让 Agent 重新整理这条素材？"
                            action={changeMaterialStatus}
                            hidden={{ id: material.id, status: "new" }}
                            submitLabel="放回未处理"
                            successMessage="已放回未处理"
                          >
                            <p>它会重新出现在 Agent 的待办里。已经整理出的知识块和选题不受影响。</p>
                          </ModalForm>
                        )}
                        <ModalForm
                          triggerLabel="归档"
                          triggerVariant="link"
                          title="归档这条素材？"
                          action={changeMaterialStatus}
                          hidden={{ id: material.id, status: "archived" }}
                          submitLabel="归档"
                          successMessage="素材已归档"
                        >
                          <p>归档后它不再出现在 Agent 的待办里，内容会保留，随时可以放回来。</p>
                        </ModalForm>
                      </>
                    )}
                    {!hasOutputs && (
                      <ModalForm
                        triggerLabel="删除"
                        triggerVariant="linkDanger"
                        title="删除这条素材？"
                        action={removeMaterial}
                        hidden={{ id: material.id }}
                        submitLabel="删除"
                        submitVariant="danger"
                        successMessage="素材已删除"
                      >
                        <p>这条素材会被永久删除，无法恢复。</p>
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
