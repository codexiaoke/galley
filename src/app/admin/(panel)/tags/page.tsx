import { ExternalLink, Hash } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { viewsByGroup } from "@/core/services/analytics";
import { listTags } from "@/core/services/tags";
import { tagPath } from "@/core/tags";
import { changeTag } from "../../actions";
import { requireOwner } from "../../auth";
import { ModalForm } from "../../modal";
import { Card, EmptyState, Field, INPUT, LetterTile, PageHeader, PageSkeleton, PrimaryCell, ROW_LINK, RowActions, Table } from "../../ui";

export default function TagsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Tags />
    </Suspense>
  );
}

async function Tags() {
  await requireOwner();
  const db = getDb();
  const tags = listTags(db);
  const views = new Map(viewsByGroup(db, 30).tags.map((t) => [t.name.toLowerCase(), t.views]));
  return (
    <>
      <PageHeader title="标签" description="已发布文章用到的标签。标签由 Agent 写文章时起，跟着文章一起审阅；这里可以改名、合并或者删掉。" />
      <Card flush footer={tags.length > 0 ? `共 ${tags.length} 个标签。改名和删除会修改所有用到它的文章，立即生效，留下新版本。` : undefined}>
        <Table head={["标签", "文章", "近 30 天阅读", ""]} empty={tags.length === 0 ? <EmptyState icon={Hash} title="还没有标签" hint="Agent 写文章时会给文章打标签，批准之后出现在这里。" /> : undefined}>
          {tags.map(({ tag, count }) => (
            <tr key={tag}>
              <td>
                <PrimaryCell leading={<LetterTile icon={Hash} />} title={tag} />
              </td>
              <td className="tabular-nums text-a-muted">{count} 篇</td>
              <td className="tabular-nums text-a-muted">{views.get(tag.toLowerCase()) ?? 0}</td>
              <td>
                <RowActions>
                  <Link href={tagPath(tag)} target="_blank" className={ROW_LINK}>
                    查看
                    <ExternalLink size={13} />
                  </Link>
                  <ModalForm triggerLabel="改名" triggerVariant="link" title={`给「${tag}」改名`} action={changeTag} hidden={{ from: tag, op: "rename" }} submitLabel="改名" successMessage="标签已改名">
                    <Field label="新的名字" hint="改成另一个已有标签的名字，就是把两个标签合并成一个。">
                      <input name="to" required defaultValue={tag} className={INPUT} />
                    </Field>
                    <p className="text-a-muted">用到它的 {count} 篇文章会一起修改，立即生效。</p>
                  </ModalForm>
                  <ModalForm
                    triggerLabel="删除"
                    triggerVariant="linkDanger"
                    title={`删除标签「${tag}」？`}
                    action={changeTag}
                    hidden={{ from: tag, op: "delete" }}
                    submitLabel="删除"
                    submitVariant="danger"
                    successMessage="标签已删除"
                  >
                    <p>这个标签会从 {count} 篇文章上去掉，文章本身不受影响。立即生效。</p>
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
