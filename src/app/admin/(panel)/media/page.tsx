import { ImageIcon, Plus } from "lucide-react";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { listMedia, MAX_MEDIA_BYTES } from "@/core/services/media";
import { removeMedia, saveMediaAlt, uploadMedia } from "../../actions";
import { requireOwner } from "../../auth";
import { CopyInline } from "../../copy";
import { ModalForm } from "../../modal";
import { Badge, Card, EmptyState, Field, formatRelative, INPUT, PageHeader, PageSkeleton, RowActions, Table } from "../../ui";

export default function MediaPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MediaLibrary />
    </Suspense>
  );
}

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

async function MediaLibrary() {
  await requireOwner();
  const items = listMedia(getDb());
  const now = new Date();
  return (
    <>
      <PageHeader
        title="媒体库"
        description="文章里用的图片。上传之后把「引用」那一栏的写法复制到正文里；Agent 写文章时也只能用这里的图片。"
        actions={
          <ModalForm
            triggerLabel={
              <>
                <Plus size={16} />
                上传图片
              </>
            }
            triggerVariant="primary"
            title="上传图片"
            action={uploadMedia}
            submitLabel="上传"
            successMessage="图片已上传"
          >
            <Field label="图片" hint={`支持 PNG、JPEG、GIF、WebP、AVIF，不超过 ${MAX_MEDIA_BYTES / 1024 / 1024} MB。`}>
              <input name="file" type="file" required accept="image/png,image/jpeg,image/gif,image/webp,image/avif" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-a-subtle file:px-3 file:py-1.5 file:text-sm file:text-a-text hover:file:bg-a-border" />
            </Field>
            <Field label="说明" hint="一句话描述图片的内容。图片加载不出来时会显示它，读屏软件也会读它。">
              <input name="alt" placeholder="例如 后台看板的截图" className={INPUT} />
            </Field>
          </ModalForm>
        }
      />
      <Card flush footer={items.length > 0 ? `共 ${items.length} 张图片` : undefined}>
        <Table
          head={["图片", "引用", "大小", "被使用", "上传", ""]}
          empty={items.length === 0 ? <EmptyState icon={ImageIcon} title="还没有图片" hint="点右上角的「上传图片」传一张，然后在文章里引用它。" /> : undefined}
        >
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="flex items-center gap-3">
                  <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 后台的缩略图，直接显示原图即可 */}
                    <img src={item.url} alt={item.alt} loading="lazy" className="size-12 rounded-md bg-a-subtle object-cover" />
                  </a>
                  <div className="min-w-0">
                    <div className="max-w-56 truncate text-a-text">{item.alt || <span className="text-a-muted">没有说明</span>}</div>
                    {item.originalName && <div className="max-w-56 truncate text-xs text-a-muted">{item.originalName}</div>}
                    {item.uploadedBy && (
                      <div className="mt-1">
                        <Badge tone="purple">{item.uploadedBy} 上传</Badge>
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td>
                <CopyInline text={`![${item.alt}](${item.url})`} />
              </td>
              <td className="whitespace-nowrap tabular-nums text-a-muted">{formatSize(item.size)}</td>
              <td className="whitespace-nowrap text-a-muted">{item.usedBy > 0 ? `${item.usedBy} 篇` : "—"}</td>
              <td className="whitespace-nowrap text-a-muted">{formatRelative(item.createdAt, now)}</td>
              <td>
                <RowActions>
                  <ModalForm triggerLabel="改说明" triggerVariant="link" title="修改图片的说明" action={saveMediaAlt} hidden={{ id: item.id }} successMessage="说明已更新">
                    <Field label="说明" hint="只影响之后复制的引用写法。已经写进文章里的说明不会跟着变。">
                      <input name="alt" defaultValue={item.alt} className={INPUT} />
                    </Field>
                  </ModalForm>
                  {item.usedBy === 0 && (
                    <ModalForm
                      triggerLabel="删除"
                      triggerVariant="linkDanger"
                      title="删除这张图片？"
                      action={removeMedia}
                      hidden={{ id: item.id }}
                      submitLabel="删除"
                      submitVariant="danger"
                      successMessage="图片已删除"
                    >
                      <p>这张图片会被永久删除，无法恢复。</p>
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
