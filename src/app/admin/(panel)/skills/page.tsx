import { BookMarked, Download, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { listSkills, listSkillSuggestions, type SkillSource } from "@/core/services/skills";
import { handleSkillSuggestion, restoreSkill } from "../../actions";
import { requireOwner } from "../../auth";
import { ModalForm } from "../../modal";
import { QuickAction } from "../../quick-action";
import { Badge, buttonClass, Card, EmptyState, formatRelative, IconTile, PageHeader, PageSkeleton, PrimaryCell, ROW_LINK, RowActions, Table, type Tone } from "../../ui";

const SOURCE: Record<SkillSource, { label: string; tone: Tone }> = {
  default: { label: "默认", tone: "neutral" },
  modified: { label: "你改过", tone: "blue" },
  custom: { label: "你新建的", tone: "purple" },
};

export default function SkillsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Skills />
    </Suspense>
  );
}

async function Skills() {
  await requireOwner();
  const db = getDb();
  const skills = listSkills(db);
  const suggestions = listSkillSuggestions(db);
  const now = new Date();
  return (
    <>
      <PageHeader
        title="技能"
        description="写给 Agent 的运营要求。它每次连接都会先读这些，所以想让它换个做法，改这里比每次在批注里说一遍有效。"
        actions={
          <>
            {/* 给不通过 MCP 读技能的 Agent 产品手动安装用 */}
            <a href="/admin/skills-export" className={buttonClass("secondary")} title="导出成标准的技能文件夹，给不通过 MCP 读技能的 Agent 产品手动安装">
              <Download size={15} />
              导出技能文件夹
            </a>
            <Link href="/admin/skills/new" className={buttonClass("primary")}>
              <Plus size={16} />
              新建技能
            </Link>
          </>
        }
      />

      {suggestions.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 font-semibold">Agent 的修改建议</h2>
          <p className="mb-4 text-xs text-a-muted">Agent 不能自己改技能，只能在这里提。采纳的话，打开对应的技能把它写进去，再标为已处理。</p>
          <ul className="divide-y divide-a-border border-y border-a-border">
            {suggestions.map((item) => (
              <li key={item.id} className="py-3.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-a-muted">
                  <Link href={`/admin/skills/${item.skillName}`}>
                    <Badge tone="blue">{item.skillName}</Badge>
                  </Link>
                  <span>
                    {item.agentName ?? "已删除的 Agent"} · {formatRelative(item.createdAt, now)}
                  </span>
                </div>
                {/* Agent 写的文字只当作纯文字显示 */}
                <p className="whitespace-pre-wrap break-words leading-relaxed">{item.suggestion}</p>
                {item.reason && <p className="mt-1 whitespace-pre-wrap break-words text-a-muted">原因：{item.reason}</p>}
                <div className="-ml-1.5 mt-1.5 flex items-center gap-0.5">
                  <Link href={`/admin/skills/${item.skillName}`} className={ROW_LINK}>
                    去修改这个技能
                  </Link>
                  <QuickAction action={handleSkillSuggestion} fields={{ id: item.id, status: "done" }} successMessage="已标为处理完">
                    已处理
                  </QuickAction>
                  <QuickAction action={handleSkillSuggestion} fields={{ id: item.id, status: "dismissed" }} successMessage="已忽略这条建议">
                    不采纳
                  </QuickAction>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card flush footer={`共 ${skills.length} 个技能`}>
        <Table head={["技能", "来源", "修改时间", ""]} empty={skills.length === 0 ? <EmptyState icon={BookMarked} title="还没有技能" hint="点右上角的「新建技能」写一个。" /> : undefined}>
          {skills.map((skill) => (
            <tr key={skill.name}>
              <td>
                <PrimaryCell leading={<IconTile icon={BookMarked} />} title={skill.name} subtitle={skill.description} />
              </td>
              <td>
                <Badge tone={SOURCE[skill.source].tone}>{SOURCE[skill.source].label}</Badge>
              </td>
              <td className="text-a-muted">{skill.updatedAt ? formatRelative(skill.updatedAt, now) : "—"}</td>
              <td>
                <RowActions>
                  <Link href={`/admin/skills/${skill.name}`} className={ROW_LINK}>
                    编辑
                  </Link>
                  {skill.source === "modified" && (
                    <ModalForm
                      triggerLabel="恢复默认"
                      triggerVariant="linkDanger"
                      title="恢复成默认的版本？"
                      action={restoreSkill}
                      hidden={{ name: skill.name }}
                      submitLabel="恢复默认"
                      submitVariant="danger"
                      successMessage="已恢复成默认版本"
                    >
                      <p>「{skill.name}」会换回程序自带的版本，Agent 下次连接读到的就是默认的要求。你改过的内容还留在修改记录里，可以找回来。</p>
                    </ModalForm>
                  )}
                  {skill.source === "custom" && (
                    <ModalForm
                      triggerLabel="删除"
                      triggerVariant="linkDanger"
                      title="删除这个技能？"
                      action={restoreSkill}
                      hidden={{ name: skill.name }}
                      submitLabel="删除"
                      submitVariant="danger"
                      successMessage="技能已删除"
                    >
                      <p>「{skill.name}」是你自己新建的，删除后 Agent 就读不到它了。</p>
                    </ModalForm>
                  )}
                </RowActions>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
