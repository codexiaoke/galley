import { useEffect, useRef, useState } from "react";
import { Download, Film, RefreshCw, Search } from "lucide-react";
import { Badge, buttonClass, EmptyState, Field, INPUT, PageHeader, PrimaryCell, RowActions, Table, type Tone } from "../../src/app/admin/ui";
import { Modal, ModalForm } from "../../src/app/admin/modal";
import { Select } from "../../src/app/admin/select";
import type { StudioExport } from "../../src/core/studio-exports";
import { duration, request, run } from "./actions";

export type ExportRecord = StudioExport & { approval: "historical" | "superseded" | "direct" | "approved" | "in_review" | "sample" };
const approvalLabels = { historical: "历史导出 · 未审查", superseded: "历史样片", direct: "Agent 定稿 · 未经人工审阅", approved: "已审查定稿", in_review: "待审样片", sample: "样片" };

export const active = (job: StudioExport) => job.state === "running" || job.state === "cancelling";
export const percent = (job: StudioExport) => job.estimatedMs ? Math.min(99, Math.floor(job.timeMs / job.estimatedMs * 100)) : 0;
const states: Record<StudioExport["state"], { label: string; tone: Tone }> = {
  running: { label: "正在导出", tone: "blue" }, cancelling: { label: "正在取消", tone: "amber" },
  done: { label: "已完成", tone: "green" }, cancelled: { label: "已取消", tone: "neutral" }, failed: { label: "导出失败", tone: "red" },
};

export function ExportBadge({ job }: { job: StudioExport }) {
  return <Badge tone={states[job.state].tone} dot>{states[job.state].label}</Badge>;
}

function ExportPreview({ id }: { id: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current!;
    const dialog = video.closest("dialog")!;
    const update = () => {
      if (dialog.open && !dialog.dataset.closing) {
        if (!video.src) video.src = `/api/exports/${id}/video?inline=1`;
      } else video.pause();
    };
    const observer = new MutationObserver(update);
    observer.observe(dialog, { attributes: true, attributeFilter: ["open", "data-closing"] });
    return () => { observer.disconnect(); video.pause(); };
  }, [id]);
  return <video ref={ref} controls preload="metadata" className="aspect-video w-full bg-black" />;
}

export function CancelExport({ job, refresh }: { job: StudioExport; refresh: () => Promise<void> }) {
  return <ModalForm triggerLabel="取消导出" triggerVariant="link" title="取消这次导出？" submitLabel="取消导出" successMessage="正在取消导出"
    action={() => run(async () => { await request(`/api/exports/${job.id}/cancel`, "POST"); await refresh(); })}>
    <p>「{job.name}」将停止导出。已经生成的配音会保留，可以稍后重新导出。</p>
  </ModalForm>;
}

export function ExportHistory({ jobs, articles, refresh }: { jobs: ExportRecord[]; articles: { slug: string; title: string }[]; refresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const [error, setError] = useState("");
  const title = (job: StudioExport) => articles.find((article) => article.slug === job.slug)?.title ?? job.title;
  const filtered = jobs.filter((job) => (state === "all" || job.state === state) && `${job.name} ${title(job)}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeader title="导出记录" description="管理每次导出的成片、字幕和制作进度。" actions={<button onClick={() => { setError(""); void refresh().catch((cause) => setError(String(cause))); }} className={buttonClass()}><RefreshCw size={14} />刷新</button>} />
    {error && <p role="alert" className="mb-4 text-a-danger">{error}</p>}
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="relative w-72 max-w-full"><Search size={15} className="absolute left-3 top-2 text-a-muted" /><input aria-label="搜索视频" placeholder="搜索视频或文章" value={search} onChange={(event) => setSearch(event.target.value)} className={`${INPUT} !pl-9`} /></label>
      <form method="post" onSubmit={(event) => { event.preventDefault(); setState(String(new FormData(event.currentTarget).get("state"))); }}>
        <Select name="state" defaultValue="all" ariaLabel="筛选导出状态" submitOnChange options={[{ value: "all", label: "全部状态" }, ...Object.entries(states).map(([value, item]) => ({ value, label: item.label }))]} />
      </form>
      <span className="text-xs text-a-muted">{filtered.length} 条记录</span>
    </div>
    <Table head={["视频", "状态", "创建时间", "时长 / 大小", <span key="actions" className="block text-right">操作</span>]}
      empty={!filtered.length && <EmptyState icon={Film} title={jobs.length ? "没有匹配的记录" : "还没有导出视频"} hint={jobs.length ? "试试其他名称或状态。" : "在视频项目中审查讲稿，生成配音后导出样片。"} />}>
      {filtered.map((job) => <tr key={job.id}>
        <td><PrimaryCell leading={<Film size={17} className="shrink-0 text-a-muted" />} title={<span title={job.name}>{job.name}</span>} subtitle={title(job)} />
          <div className="mt-1 flex gap-2"><Badge tone={job.approval === "approved" ? "green" : job.approval === "direct" ? "amber" : "neutral"}>{approvalLabels[job.approval]}</Badge>{job.projectId && <a href={`#project/${job.projectId}`} className="text-xs text-a-muted hover:underline">查看项目</a>}</div>
          {job.error && <p className="mt-1 truncate text-xs text-a-danger" title={job.error}>{job.error}</p>}</td>
        <td><ExportBadge job={job} />{active(job) && <span className="ml-2 text-xs tabular-nums text-a-muted">{percent(job)}%</span>}</td>
        <td className="text-xs text-a-muted">{new Date(job.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
        <td><div className="tabular-nums">{duration(job.state === "done" ? job.timeMs : job.estimatedMs)}</div><div className="text-xs text-a-muted">{job.bytes ? `${(job.bytes / 1024 / 1024).toFixed(1)} MB · ` : ""}4K · 30 fps</div></td>
        <td><RowActions>
          {job.state === "done" && <>
            <Modal triggerLabel="预览" title={job.name} wide><ExportPreview id={job.id} /></Modal>
            <a href={`/api/exports/${job.id}/video`} download className={buttonClass("link")}><Download size={13} />视频</a>
            <a href={`/api/exports/${job.id}/subtitles`} download className={buttonClass("link")}>字幕</a>
          </>}
          {active(job) ? <CancelExport job={job} refresh={refresh} /> : <>
            <ModalForm triggerLabel="重命名" triggerVariant="link" title="重命名视频" successMessage="名称已更新"
              action={(_, form) => run(async () => { await request(`/api/exports/${job.id}`, "PATCH", { name: String(form.get("name")) }); await refresh(); })}>
              <Field label="视频名称"><input className={INPUT} name="name" defaultValue={job.name} required maxLength={120} /></Field>
            </ModalForm>
            {!["approved", "direct", "in_review"].includes(job.approval) && <ModalForm triggerLabel="删除" triggerVariant="linkDanger" title="删除这条导出记录？" submitLabel="删除" submitVariant="danger" successMessage="导出记录已删除"
              action={() => run(async () => { await request(`/api/exports/${job.id}`, "DELETE"); await refresh(); })}>
              <p>将删除「{job.name}」的记录和工坊中的视频、字幕文件。文章、配音和已经下载的文件不受影响。</p>
            </ModalForm>}
          </>}
        </RowActions></td>
      </tr>)}
    </Table>
    <p className="mt-4 text-xs text-a-muted">导出记录保存在本机，刷新页面或重启工坊后仍可查看。</p>
  </>;
}
