import { Box, ImageIcon, Plus } from "lucide-react";
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
        description="文章里的图片、贴图和 GLB 模型。图片引用可复制到正文，模型地址用于三维场景。"
        actions={
          <ModalForm
            triggerLabel={
              <>
                <Plus size={16} />
                上传资源
              </>
            }
            triggerVariant="primary"
            title="上传资源"
            action={uploadMedia}
            submitLabel="上传"
            successMessage="资源已上传"
          >
            <Field label="文件" hint={`支持 PNG、JPEG、GIF、WebP、AVIF、自包含 GLB，不超过 ${MAX_MEDIA_BYTES / 1024 / 1024} MB。`}>
              <input name="file" type="file" required accept="image/png,image/jpeg,image/gif,image/webp,image/avif,model/gltf-binary,.glb" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-a-subtle file:px-3 file:py-1.5 file:text-sm file:text-a-text hover:file:bg-a-border" />
            </Field>
            <Field label="说明" hint="一句话描述图片的内容。图片加载不出来时会显示它，读屏软件也会读它。">
              <input name="alt" placeholder="例如 后台看板的截图" className={INPUT} />
            </Field>
          </ModalForm>
        }
      />
      <Card flush footer={items.length > 0 ? `共 ${items.length} 个资源` : undefined}>
        <Table
          head={["资源", "引用", "大小", "被使用", "上传", ""]}
          empty={items.length === 0 ? <EmptyState icon={ImageIcon} title="还没有资源" hint="点右上角的「上传资源」传一个，然后在文章里引用它。" /> : undefined}
        >
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="flex items-center gap-3">
                  <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 后台的缩略图，直接显示原图即可 */}
                    {item.mime === "model/gltf-binary" ? <Box size={32} aria-label="GLB 模型" /> : <img src={item.url} alt={item.alt} loading="lazy" className="size-12 rounded-md bg-a-subtle object-cover" />}
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
                <CopyInline text={item.mime === "model/gltf-binary" ? item.url : `![${item.alt}](${item.url})`} />
              </td>
              <td className="whitespace-nowrap tabular-nums text-a-muted">{formatSize(item.size)}</td>
              <td className="whitespace-nowrap text-a-muted">{item.usedBy > 0 ? `${item.usedBy} 篇` : "—"}</td>
              <td className="whitespace-nowrap text-a-muted">{formatRelative(item.createdAt, now)}</td>
              <td>
                <RowActions>
                  <ModalForm triggerLabel="改说明" triggerVariant="link" title="修改资源的说明" action={saveMediaAlt} hidden={{ id: item.id }} successMessage="说明已更新">
                    <Field label="说明" hint="只影响之后复制的引用写法。已经写进文章里的说明不会跟着变。">
                      <input name="alt" defaultValue={item.alt} className={INPUT} />
                    </Field>
                  </ModalForm>
                  {item.usedBy === 0 && (
                    <ModalForm
                      triggerLabel="删除"
                      triggerVariant="linkDanger"
                      title="删除这个资源？"
                      action={removeMedia}
                      hidden={{ id: item.id }}
                      submitLabel="删除"
                      submitVariant="danger"
                      successMessage="资源已删除"
                    >
                      <p>这个资源会被永久删除，无法恢复。</p>
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
