import { useState } from "react";
import { Download, FileText, Volume2 } from "lucide-react";
import { Badge, buttonClass, DetailRow, Field, INPUT, PageHeader, RowActions, Table, type Tone } from "../../src/app/admin/ui";
import { Modal, ModalForm } from "../../src/app/admin/modal";
import { Select } from "../../src/app/admin/select";
import type { Beat, ReviewStatus, StudioProjectDetail } from "../../src/core/studio-types";
import type { StudioExport } from "../../src/core/studio-exports";
import { beatLength } from "./timing.js";
import { duration, request, run } from "./actions";
import { active, CancelExport, ExportBadge, percent } from "./history";
import { GuideFields, GuideSummary, readGuides } from "./guides";
import { PresentationPreview } from "./preview";
import type { Agent } from "./management";

export const labelOf = (beat: Beat) => beat.kind === "cover" ? "封面" : beat.kind === "ending" ? "结尾" : beat.kind === "page" ? `第 ${beat.page} 页` : `第 ${beat.page} 页 · 步骤 ${Number(beat.id.split(".").at(-1)) + 1}`;
const statuses: Record<ReviewStatus, { text: string; tone: Tone }> = { draft: { text: "草稿", tone: "neutral" }, in_review: { text: "待审查", tone: "amber" }, approved: { text: "已通过", tone: "green" }, rejected: { text: "待修改", tone: "red" } };
export function ReviewBadge({ status, direct = false }: { status: ReviewStatus; direct?: boolean }) { return <Badge tone={direct ? "amber" : statuses[status].tone}>{direct ? "Agent 确认 · 未经人工审阅" : statuses[status].text}</Badge>; }

export function ProjectView({ project, jobs, agents, refresh }: { project: StudioProjectDetail; jobs: StudioExport[]; agents: Agent[]; refresh: () => Promise<void> }) {
  const rev = project.revision;
  const [tab, setTab] = useState<"presentation" | "sample">("presentation");
  const [time, setTime] = useState(0);
  const job = jobs.find((job) => job.id === rev.sampleExportId);
  const rendering = jobs.some(active);
  const running = rev.voiceJob.state === "running";
  const locked = rev.scriptStatus === "in_review" || rev.videoStatus === "in_review" || running;
  const canVoice = rev.scriptStatus === "approved" && !running && !["in_review", "approved"].includes(rev.videoStatus);
  const voiced = rev.beats.filter((beat) => beat.text), done = rev.voices.length;
  const total = rev.beats.reduce((sum, beat) => sum + beatLength(beat, rev.voices.find((voice) => voice.id === beat.id)), 0);
  const invoke = (operation: string, data: object = {}) => run(async () => { await request(`/api/projects/${project.id}/${operation}`, "POST", { revisionId: rev.id, ...data }); await refresh(); });
  const review = (stage: "script" | "video") => {
    const status = stage === "script" ? rev.scriptStatus : rev.videoStatus, title = stage === "script" ? "讲稿" : "样片";
    const canSubmit = stage === "script" || job?.state === "done";
    return <div className="flex flex-wrap items-center gap-2"><span className="mr-1 font-medium">{stage === "script" ? "1. 讲稿审查" : "3. 成片审查"}</span><ReviewBadge status={status} direct={stage === "script" ? rev.scriptDirect : rev.videoDirect} />
      {(status === "draft" || status === "rejected") && canSubmit && <ModalForm triggerLabel={`提交${title}`} triggerVariant="link" title={`提交${title}审查`} submitLabel="提交审查" action={() => invoke("submit", { stage })}><p>提交 v{rev.number} {title}供站长审查。待审期间不能修改，所有未回复批注需先处理。</p></ModalForm>}
      {status === "in_review" && <>
        <ModalForm triggerLabel="批准" triggerVariant="primary" title={`批准这个版本的${title}？`} submitLabel={stage === "video" ? "批准并定稿" : "批准讲稿"} action={(_, form) => invoke("decide", { stage, decision: "approve", note: String(form.get("note")) })}><p>{stage === "script" ? "请逐拍检查讲稿、指向目标、画面与节奏。批准后可以开始生成配音。" : "请完整审看当前 4K 样片。批准后将此文件标记为定稿，不会再次渲染或上传外部平台。"}</p><Field label="审查说明（选填）"><textarea className={INPUT} name="note" maxLength={2000} /></Field></ModalForm>
        <ModalForm triggerLabel="打回修改" triggerVariant="link" title={`打回${title}`} submitLabel="打回修改" action={(_, form) => invoke("decide", { stage, decision: "reject", note: String(form.get("note")) })}><Field label="需要修改的地方"><textarea name="note" className={INPUT} required maxLength={2000} rows={4} /></Field></ModalForm>
        <ModalForm triggerLabel="撤回" triggerVariant="link" title="撤回审查？" submitLabel="撤回" action={() => invoke("withdraw", { stage })}><p>撤回后可以继续修改，再次提交。</p></ModalForm>
      </>}
    </div>;
  };
  return <>
    <a href="#projects" className={`${buttonClass("link")} mb-4`}>← 所有项目</a>
    <PageHeader title={project.name} description={`v${rev.number} · 来源：${rev.source.title} · ${rev.beats.length} 拍 · 约 ${duration(total)}`} actions={<ModalForm triggerLabel="项目设置" title="项目设置" action={(_, form) => run(async () => { await request(`/api/projects/${project.id}`, "PATCH", { name: String(form.get("name")), assignedAgentId: form.get("agent") || null }); await refresh(); })}><Field label="项目名称"><input name="name" className={INPUT} defaultValue={project.name} maxLength={120} required /></Field><Field label="负责 Agent"><Select name="agent" defaultValue={project.assignedAgentId ?? ""} options={[{ value: "", label: "站长自己制作" }, ...agents.filter((agent) => !agent.disabled).map((agent) => ({ value: agent.id, label: agent.name }))]} /></Field></ModalForm>} />
    <div className="mb-6 space-y-4 border-b border-a-border pb-5">
      {review("script")}
      <div className="flex flex-wrap items-center gap-2"><span className="mr-1 font-medium">2. 配音与样片</span><Badge tone={done === voiced.length ? "green" : "neutral"}>配音 {done}/{voiced.length}</Badge>
        {canVoice && done < voiced.length && <ModalForm triggerLabel="生成缺少的配音" triggerVariant="link" title="生成当前讲稿的配音？" submitLabel="开始生成" action={() => invoke("voices")}><p>使用已通过审查的 v{rev.number} 讲稿；文字未变的配音会复用。生成在本机后台进行，可关闭页面。</p></ModalForm>}
        {canVoice && done === voiced.length && !rendering && <ModalForm triggerLabel={<><Download size={14} />生成 4K 样片</>} title="生成 4K 样片" submitLabel="开始导出" action={(_, form) => invoke("render", { name: String(form.get("name")) })}><Field label="视频名称"><input name="name" className={INPUT} defaultValue={`${project.name} · v${rev.number}`} required maxLength={120} /></Field><DetailRow label="规格">3840 × 2160 · 30 fps · H.264 / AAC</DetailRow><p className="text-xs text-a-muted">逐帧生成画面，合成原始配音与字幕。完成后提交成片审查。</p></ModalForm>}
        {running && <span role="status" className="text-xs text-a-muted">{rev.voiceJob.message}</span>}
      </div>
      {rev.voiceJob.error && <p role="alert" className="text-a-danger">{rev.voiceJob.error}</p>}
      {review("video")}
      {job && <div className="flex flex-wrap items-center gap-3 text-xs"><ExportBadge job={job} /><span>{job.name}{active(job) ? ` · ${percent(job)}% · 已生成 ${duration(job.timeMs)}` : ""}</span>{active(job) && <CancelExport job={job} refresh={refresh} />}{job.error && <span className="text-a-danger">{job.error}</span>}{job.state === "done" && <><a href={`/api/exports/${job.id}/video`} download className={buttonClass("link")}>下载{rev.videoStatus === "approved" ? "定稿" : "样片"}</a><a href={`/api/exports/${job.id}/subtitles`} download className={buttonClass("link")}>字幕</a></>}</div>}
    </div>
    <div className="studio-workspace">
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap gap-3"><button className={buttonClass(tab === "presentation" ? "secondary" : "link")} onClick={() => setTab("presentation")}>画面预览</button><button disabled={job?.state !== "done"} className={buttonClass(tab === "sample" ? "secondary" : "link")} onClick={() => setTab("sample")}>4K 样片</button><span className="ml-auto self-center text-xs text-a-muted">v{rev.number} · 16:9</span></div>
        {tab === "sample" && job?.state === "done" ? <><video key={job.id} controls preload="metadata" src={`/api/exports/${job.id}/video?inline=1`} className="aspect-video w-full bg-black" onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} /><p className="mt-2 text-xs text-a-muted">审看位置 {duration(time * 1000)}。下方添加成片批注会带入当前时间。</p></> : <PresentationPreview key={`${rev.id}:${rev.voices.map((voice) => voice.audio).join()}`} revision={rev} />}
        <div className="mt-5 flex flex-wrap gap-3">
          {!locked && <ModalForm triggerLabel="同步来源文章" triggerVariant="link" title="同步来源文章？" submitLabel="检查并同步" action={() => invoke("sync")}><p>文章或引用画面有更新时，建立新版本。相同拍点保留工坊讲稿，新增拍点使用文章讲稿。请逐拍核对，重新提交审查。</p></ModalForm>}
          {!locked && <ModalForm triggerLabel="建立修订版本" triggerVariant="link" title="建立修订版本" submitLabel="建立新版本" action={(_, form) => invoke("revise", { edits: [], note: String(form.get("note")) })}><Field label="修订说明"><textarea name="note" className={INPUT} required maxLength={2000} /></Field><p className="text-xs text-a-muted">保留现有讲稿和配音，新版本重新审查；历史定稿仍可查看和下载。</p></ModalForm>}
        </div>
        <section className="mt-7 border-t border-a-border pt-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">审查批注 <span className="text-xs font-normal text-a-muted">{project.comments.filter((comment) => !comment.reply).length} 条待回复</span></h2>
          <ModalForm triggerLabel="添加批注" title="添加审查批注" action={(_, form) => invoke("comments", { stage: String(form.get("stage")), beatId: form.get("beat") || undefined, timeMs: form.get("seconds") ? Number(form.get("seconds")) * 1000 : undefined, body: String(form.get("body")) })}>
            <Field label="审查阶段"><Select name="stage" defaultValue={tab === "sample" ? "video" : "script"} options={[{ value: "script", label: "讲稿" }, { value: "video", label: "成片" }]} /></Field>
            <Field label="关联拍点"><Select name="beat" defaultValue="" options={[{ value: "", label: "整体意见" }, ...rev.beats.map((beat) => ({ value: beat.id, label: labelOf(beat) }))]} /></Field>
            <Field label="视频时间点（秒，选填）"><input name="seconds" type="number" min={0} step="0.1" className={INPUT} defaultValue={tab === "sample" ? time.toFixed(1) : ""} /></Field><Field label="需要调整的内容"><textarea name="body" className={INPUT} required maxLength={2000} rows={4} /></Field>
          </ModalForm></div>
          {!project.comments.length && <p className="text-sm text-a-muted">还没有批注。可关联具体拍点或视频时间。</p>}
          {project.comments.map((comment) => <div key={comment.id} className="border-b border-a-border py-3"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-a-muted"><Badge tone={comment.reply ? "neutral" : "amber"}>{comment.reply ? "已回复" : "待回复"}</Badge><span>v{project.revisions.find((item) => item.id === comment.revisionId)?.number} · {comment.stage === "script" ? "讲稿" : "成片"}{comment.beatId ? ` · ${comment.beatId}` : ""}{comment.timeMs !== null ? ` · ${duration(comment.timeMs)}` : ""}</span></div><p className="whitespace-pre-wrap leading-relaxed">{comment.body}</p>{comment.reply && <p className="mt-2 whitespace-pre-wrap text-sm text-a-muted">修改回复：{comment.reply}</p>}<div className="mt-2"><ModalForm triggerLabel={comment.reply ? "更新回复" : "回复批注"} triggerVariant="link" title="回复审查批注" action={(_, form) => invoke("reply", { commentId: comment.id, reply: String(form.get("reply")) })}><p className="text-a-muted">{comment.body}</p><Field label="处理结果"><textarea name="reply" className={INPUT} required maxLength={2000} rows={4} defaultValue={comment.reply ?? ""} /></Field></ModalForm></div></div>)}
        </section>
      </section>
      <section className="studio-script"><div className="mb-3 flex items-center gap-2 font-semibold"><FileText size={15} />讲稿与指向<span className="ml-auto text-xs font-normal text-a-muted">v{rev.number}</span></div><div className="studio-script-scroll"><Table head={["内容 / 配音", "操作"]}>{rev.beats.map((beat) => {
        const voice = rev.voices.find((item) => item.id === beat.id);
        return <tr key={beat.id}><td className="!whitespace-normal"><div className="mb-1 text-xs text-a-muted">{labelOf(beat)} · {(beatLength(beat, voice) / 1000).toFixed(1)} 秒</div><p className="whitespace-pre-wrap leading-relaxed">{beat.text || <span className="text-xs text-a-muted">{beat.title || "无旁白"}</span>}</p><GuideSummary beat={beat} />{voice && <audio controls preload="none" src={voice.audio} className="mt-2 h-8 w-full min-w-0" aria-label={`试听${labelOf(beat)}`} />}</td><td><div className="flex flex-col items-start gap-2">{!locked && <ModalForm triggerLabel="编辑" triggerVariant="link" title={`编辑${labelOf(beat)}`} action={(_, form) => invoke("revise", { edits: [{ id: beat.id, text: String(form.get("text")), suggestedMs: Number(form.get("seconds")) * 1000, guides: readGuides(form) }], note: String(form.get("note")) })}><Field label="讲稿（留空表示无旁白）"><textarea name="text" className={INPUT} defaultValue={beat.text} maxLength={2000} rows={6} /></Field><Field label="无配音时的停留秒数"><input name="seconds" type="number" className={INPUT} min={0} max={120} step="0.001" defaultValue={beat.suggestedMs / 1000} required /></Field><GuideFields beat={beat} /><Field label="修改说明"><input name="note" className={INPUT} required maxLength={2000} /></Field><p className="text-xs text-a-muted">讲稿与指向保存为新版本，共同审查。只改指向会复用已有配音。</p></ModalForm>}{canVoice && voice && <ModalForm triggerLabel={<Volume2 size={13} />} triggerVariant="link" title={`重新配音：${labelOf(beat)}`} submitLabel="重新生成" action={() => invoke("voices", { forceIds: [beat.id] })}><p>重新生成这一拍的声音，已有样片需重新导出。历史版本保留原配音。</p></ModalForm>}</div></td></tr>;
      })}</Table></div></section>
    </div>
    <section className="mt-8 border-t border-a-border pt-5"><h2 className="mb-3 font-semibold">版本与操作记录</h2><Table head={["版本", "说明", "审查状态", "查看"]}>{project.revisions.map((revision) => <tr key={revision.id}><td>v{revision.number}{revision.id === rev.id ? " · 当前" : ""}</td><td className="!whitespace-normal">{revision.note}</td><td><ReviewBadge status={revision.scriptStatus} direct={revision.scriptDirect} /><span className="mx-1">/</span><ReviewBadge status={revision.videoStatus} direct={revision.videoDirect} /></td><td><RowActions><Modal triggerLabel="讲稿" title={`v${revision.number} 讲稿`} wide><div className="max-h-[60vh] overflow-y-auto"><Table head={["拍点", "讲稿"]}>{revision.beats.map((beat) => <tr key={beat.id}><td>{labelOf(beat)}</td><td className="!whitespace-normal">{beat.text || "无旁白"}<GuideSummary beat={beat} /></td></tr>)}</Table></div></Modal>{revision.sampleExportId && <a href="#exports" className={buttonClass("link")}>导出记录</a>}</RowActions></td></tr>)}</Table><details className="mt-4"><summary className="cursor-pointer text-sm text-a-muted">操作记录（{project.events.length}）</summary><Table head={["操作", "操作者", "时间"]}>{project.events.map((event) => <tr key={event.id}><td>{event.action}<p className="max-w-xl whitespace-normal text-xs text-a-muted">{event.note}</p></td><td>{event.actorName}</td><td className="text-xs text-a-muted">{new Date(event.createdAt).toLocaleString("zh-CN")}</td></tr>)}</Table></details></section>
  </>;
}
