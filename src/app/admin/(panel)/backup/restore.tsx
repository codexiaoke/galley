"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../modal";
import { buttonClass } from "../../ui";

type Result = { ok?: boolean; error?: string; manifest?: { createdAt: string; documents: number; blocks: number; media: number }; previousDataDir?: string };

/** 从备份恢复。这是后台里影响最大的操作，所以放在弹框里，并且把后果写清楚。 */
export function RestoreBackup() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>();

  const submit = async (data: FormData) => {
    setPending(true);
    setResult(undefined);
    try {
      const response = await fetch("/admin/backup/restore", { method: "POST", body: data });
      setResult((await response.json()) as Result);
    } catch {
      setResult({ error: "上传没有成功，请检查网络后再试。" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal triggerLabel="从备份恢复" triggerVariant="secondary" title="从备份恢复">
      {result?.ok ? (
        <div className="space-y-3">
          <p className="font-medium text-a-success">恢复完成。</p>
          <p>
            站点已经回到 {result.manifest ? new Date(result.manifest.createdAt).toLocaleString("zh-CN") : "备份时"} 的样子：{result.manifest?.documents} 篇文档，{result.manifest?.blocks} 个知识块，
            {result.manifest?.media} 张图片。
          </p>
          <p className="text-a-muted">
            恢复之前的数据没有删除，放在服务器的这个目录里，确认不需要之后可以手动删掉：
            <span className="mt-1 block break-all font-mono text-xs">{result.previousDataDir}</span>
          </p>
          <button type="button" onClick={() => window.location.reload()} className={buttonClass("primary")}>
            刷新页面
          </button>
        </div>
      ) : (
        <form
          // 页面脚本还没加载好时点了提交，浏览器会按默认方式提交表单。写明用 POST，填的内容（包括密码）就不会出现在网址里。
          method="post"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget));
          }}
        >
          <p>
            选一份之前下载的备份文件。恢复会用它<strong>替换现在的全部内容</strong>：文章、知识块、素材、选题、图片、设置和 MCP 接入，都回到备份时的样子。备份之后做的修改会消失。
          </p>
          <p className="text-a-muted">现在的数据不会被直接删除，会挪到服务器数据目录下的一个文件夹里留着。稳妥起见，可以先点「下载备份」存一份现在的。</p>
          <input name="file" type="file" required accept=".gz,.tgz,application/gzip" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-a-subtle file:px-3 file:py-1.5 file:text-sm file:text-a-text hover:file:bg-a-border" />
          {result?.error && <p className="rounded-md bg-a-danger-soft px-3 py-2 text-a-danger">{result.error}</p>}
          <div className="flex justify-end">
            <button disabled={pending} className={buttonClass("danger")}>
              {pending && <LoaderCircle size={15} className="animate-spin" />}
              替换现在的内容并恢复
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
