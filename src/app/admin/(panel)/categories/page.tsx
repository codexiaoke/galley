import { FolderTree, Hash, Plus } from "lucide-react";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { listCategories } from "@/core/services/categories";
import { removeCategory, saveCategory } from "../../actions";
import { requireOwner } from "../../auth";
import { ModalForm } from "../../modal";
import { Badge, Card, EmptyState, Field, INPUT, LetterTile, PageHeader, PageSkeleton, PrimaryCell, RowActions, Table, toneFor } from "../../ui";

export default function CategoriesPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Categories />
    </Suspense>
  );
}

function CategoryFields({ category }: { category?: { name: string; slug: string; sortOrder: number } }) {
  return (
    <>
      <Field label="名称" hint="显示在前台的导航和文章上。">
        <input name="name" required defaultValue={category?.name} placeholder="例如 AI 编程" className={INPUT} />
      </Field>
      <Field label="网址别名" hint="出现在分类页的网址里，只能用小写字母、数字和连字符。">
        <input name="slug" required defaultValue={category?.slug} placeholder="例如 ai-coding" className={INPUT} />
      </Field>
      {category && (
        <Field label="排序" hint="数字小的排在前面。">
          <input name="sortOrder" type="number" defaultValue={category.sortOrder} className={INPUT} />
        </Field>
      )}
    </>
  );
}

async function Categories() {
  await requireOwner();
  const categories = listCategories(getDb());
  return (
    <>
      <PageHeader
        title="分类"
        description="分类显示在前台的导航里，每篇文章属于其中一个。Agent 写文章时只能从这里已有的分类里选。"
        actions={
          <ModalForm
            triggerLabel={
              <>
                <Plus size={16} />
                新建分类
              </>
            }
            triggerVariant="primary"
            title="新建分类"
            action={saveCategory}
            submitLabel="新建"
            successMessage="分类已创建"
          >
            <CategoryFields />
          </ModalForm>
        }
      />
      <Card flush footer={categories.length > 0 ? `共 ${categories.length} 个分类，按排序数字从小到大显示在前台` : undefined}>
        <Table
          head={["分类", "排序", "已上线文章", ""]}
          empty={categories.length === 0 ? <EmptyState icon={FolderTree} title="还没有分类" hint="点右上角的「新建分类」建一个，Agent 写文章时才有分类可选。" /> : undefined}
        >
          {categories.map((category) => (
            <tr key={category.id}>
              <td>
                <PrimaryCell leading={<LetterTile icon={Hash} />} title={<Badge tone={toneFor(category.name)}>{category.name}</Badge>} subtitle={`/category/${category.slug}`} />
              </td>
              <td className="tabular-nums text-a-muted">{category.sortOrder}</td>
              <td>{category.publishedCount > 0 ? `${category.publishedCount} 篇` : <span className="text-a-muted">暂无</span>}</td>
              <td>
                <RowActions>
                  <ModalForm triggerLabel="编辑" triggerVariant="link" title="编辑分类" action={saveCategory} hidden={{ id: category.id }} successMessage="分类已更新">
                    <CategoryFields category={category} />
                  </ModalForm>
                  <ModalForm
                    triggerLabel="删除"
                    triggerVariant="linkDanger"
                    title="删除这个分类？"
                    action={removeCategory}
                    hidden={{ id: category.id }}
                    submitLabel="删除"
                    submitVariant="danger"
                    successMessage="分类已删除"
                  >
                    <p>「{category.name}」会被永久删除，无法恢复。只有没有任何文章使用的分类才能删除。</p>
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
