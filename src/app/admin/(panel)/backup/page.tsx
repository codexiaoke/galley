import { Download } from "lucide-react";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { listBlocks } from "@/core/services/blocks";
import { listDocuments } from "@/core/services/documents";
import { listMedia } from "@/core/services/media";
import { requireOwner } from "../../auth";
import { buttonClass, PageHeader, PageSkeleton } from "../../ui";
import { RestoreBackup } from "./restore";

export default function BackupPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Backup />
    </Suspense>
  );
}

/** 页面上的一节：标题、说明、操作。节与节之间用一条细线隔开。 */
function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <section className="max-w-2xl border-t border-a-border py-6 first:border-t-0 first:pt-0">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-1.5 space-y-1.5 leading-relaxed text-a-muted">{children}</div>
      <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>
    </section>
  );
}

async function Backup() {
  await requireOwner();
  const db = getDb();
  const documents = listDocuments(db).length;
  const blocks = listBlocks(db).length;
  const images = listMedia(db).length;
  return (
    <>
      <PageHeader title="备份与导出" description="站点的全部数据都在服务器的一个目录里。定期下载一份备份，换服务器或者出了意外时可以原样恢复。" />

      <Section
        title="完整备份"
        actions={
          <>
            {/* 普通链接而不是 Link：这是下载文件，不是页面跳转 */}
            <a href="/admin/backup/download" className={buttonClass("primary")}>
              <Download size={15} />
              下载备份
            </a>
            <RestoreBackup />
          </>
        }
      >
        <p>
          一个压缩包，里面是数据库的完整快照和媒体库的全部图片。现在有 {documents} 篇文档、{blocks} 个知识块、{images} 张图片。
        </p>
        <p>包含修改历史、素材、选题和 MCP 接入的信息，所以请像保管密码一样保管它。后台的登录密码不在里面，它在服务器的环境变量里。</p>
      </Section>

      <Section
        title="导出文章"
        actions={
          <a href="/admin/backup/export" className={buttonClass("secondary")}>
            <Download size={15} />
            下载 Markdown
          </a>
        }
      >
        <p>每篇已发布的文章一个 Markdown 文件，知识块一个 JSON 文件。给人看、给别的工具用，或者只是想留一份看得懂的副本。</p>
        <p>不包含修改历史和图片，不能用来恢复站点。</p>
      </Section>
    </>
  );
}
