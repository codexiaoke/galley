import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { getDefaultSkill, getSkill, skillHistory } from "@/core/services/skills";
import { requireOwner } from "../../../auth";
import { DiffView, diffSummary } from "../../../diff";
import { formatTime, PageSkeleton } from "../../../ui";
import { SkillForm } from "./form";

/** 编辑一个技能。网址里的名字是 new 时是新建。 */
export default function SkillPage({ params }: PageProps<"/admin/skills/[name]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SkillEditor params={params} />
    </Suspense>
  );
}

async function SkillEditor({ params }: { params: Promise<{ name: string }> }) {
  await requireOwner();
  const { name } = await params;
  if (name === "new") return <SkillForm isNew skill={{ name: "", description: "", body: "" }} />;

  const db = getDb();
  const skill = getSkill(db, name);
  if (!skill) notFound();
  const base = getDefaultSkill(name);
  const history = skillHistory(db, name);
  const changedFromDefault = base && skill.source === "modified" ? diffSummary(base.body, skill.body) : undefined;

  return (
    <>
      {/* key：保存之后内容变了，表单要按新的内容重新开始 */}
      <SkillForm key={skill.updatedAt?.getTime() ?? 0} isNew={false} skill={skill} />

      {base && changedFromDefault && (
        <details className="mt-10">
          <summary className="cursor-pointer text-a-muted hover:text-a-text">
            和默认版本的差别
            <span className="ml-2 text-xs">{changedFromDefault}</span>
          </summary>
          <div className="mt-2 rounded-md border border-a-border p-3">
            <DiffView before={base.body} after={skill.body} />
          </div>
        </details>
      )}

      {history.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-semibold">修改记录</h2>
          <ul className="divide-y divide-a-border border-y border-a-border">
            {history.map((revision, i) => {
              // 和它前一个版本比；最早的一个版本和默认版本比。
              const previous = history[i + 1]?.body ?? base?.body;
              const summary = previous === undefined ? undefined : diffSummary(previous, revision.body);
              return (
                <li key={revision.id} className="py-3">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="tabular-nums text-a-muted">{formatTime(revision.createdAt)}</span>
                      <span>{revision.note || <span className="text-a-muted">没有写说明</span>}</span>
                      {summary && <span className="text-xs text-a-muted">{summary}</span>}
                    </summary>
                    <div className="mt-2 rounded-md border border-a-border p-3">
                      {previous === undefined ? (
                        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{revision.body}</pre>
                      ) : (
                        <DiffView before={previous} after={revision.body} />
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
