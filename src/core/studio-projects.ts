import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { guideTargetsSchema, guidesSchema, narrationEditSchema, resolveGuidePlan, validateBeatGuides } from "./studio-guides";
import type { Actor } from "./actor";
import type { Db } from "./db/client";
import { agents, studioComments, studioEvents, studioProjects, studioRevisions } from "./db/schema";
import { conflict, forbidden, invalid, notFound } from "./errors";
import { newId } from "./ids";
import type { StudioExport } from "./studio-exports";
import type { Beat, StudioProject, StudioProjectDetail, StudioRevision, StudioRevisionData, StudioSource, Voice } from "./studio-types";

const textSchema = z.string().trim().max(2000);
const beatSchema = z.object({ id: z.string().min(1).max(100), kind: z.enum(["cover", "page", "step", "ending"]), page: z.number().int().nonnegative(), title: z.string().nullable(), section: z.string().nullable(), text: textSchema, written: z.string().optional(), suggestedMs: z.number().min(0).max(120000), minMs: z.number().min(0).max(120000), selfPaced: z.literal(true).optional(), targets: guideTargetsSchema.optional(), guides: guidesSchema.optional() });
export const studioSourceSchema = z.object({ galley: z.string().url(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string().min(1), present: z.string().startsWith("/posts/"), version: z.string().regex(/^[a-f0-9]{64}$/), revisedAt: z.string().nullable(), beats: z.array(beatSchema).min(1).max(2000) });
export const voiceHash = (text: string) => createHash("sha256").update(text).digest("hex");
export const voicesReady = (revision: Pick<StudioRevision, "beats" | "voices">) => revision.beats.every((beat) => !beat.text || revision.voices.some((voice) => voice.id === beat.id && voice.hash === voiceHash(beat.text)));
const ownerOnly = (actor: Actor) => { if (actor.kind !== "owner") throw forbidden("只有站长可以审查、分配项目和管理权限。"); };
const cleanName = (name: string) => {
  const value = name.trim();
  if (!value || value.length > 120) throw invalid("项目名称需要 1–120 个字。");
  return value;
};

/** 项目、版本和审查的唯一业务入口；网页与 MCP 共用。 */
export class StudioProjects {
  constructor(readonly db: Db) {}

  recover() {
    for (const row of this.db.select().from(studioRevisions).all()) {
      if (row.data.voiceJob.state === "running") this.update(row.id, { voiceJob: { state: "failed", message: "", error: "配音因工坊关闭而中断，请重新生成。" } });
    }
  }

  private project(actor: Actor, id: string) {
    const row = this.db.select().from(studioProjects).where(eq(studioProjects.id, id)).get();
    if (!row || (actor.kind === "agent" && row.assignedAgentId !== actor.id)) throw notFound("没有找到你可以操作的视频项目。");
    return row;
  }

  revision(id: string): StudioRevision {
    const row = this.db.select().from(studioRevisions).where(eq(studioRevisions.id, id)).get();
    if (!row) throw notFound("没有找到这个讲稿版本。");
    return { ...row.data, id: row.id, projectId: row.projectId, number: row.number, createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime() };
  }

  current(actor: Actor, projectId: string, revisionId: string) {
    const project = this.project(actor, projectId);
    if (project.currentRevisionId !== revisionId) throw conflict("项目已更新，请重新读取后再操作，不能覆盖别人的修改。");
    return this.revision(revisionId);
  }

  list(actor: Actor): StudioProject[] {
    return this.db.select().from(studioProjects).where(actor.kind === "agent" ? eq(studioProjects.assignedAgentId, actor.id) : undefined).orderBy(desc(studioProjects.updatedAt)).all()
      .map((row) => ({ ...row, createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime(), revision: this.revision(row.currentRevisionId) }));
  }

  get(actor: Actor, id: string): StudioProjectDetail {
    const row = this.project(actor, id);
    const revisions = this.db.select({ id: studioRevisions.id }).from(studioRevisions).where(eq(studioRevisions.projectId, id)).orderBy(desc(studioRevisions.number)).all().map((item) => this.revision(item.id));
    const comments = this.db.select().from(studioComments).where(eq(studioComments.projectId, id)).orderBy(desc(studioComments.createdAt)).all().map((item) => ({ ...item, createdAt: item.createdAt.getTime() }));
    const events = this.db.select().from(studioEvents).where(eq(studioEvents.projectId, id)).orderBy(desc(studioEvents.createdAt)).all().map((item) => ({ ...item, createdAt: item.createdAt.getTime() }));
    return { ...row, createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime(), revision: this.revision(row.currentRevisionId), revisions, comments, events };
  }

  private event(actor: Actor, revision: StudioRevision, action: string, note = "") {
    this.db.insert(studioEvents).values({ id: newId(), projectId: revision.projectId, revisionId: revision.id, actorName: actor.kind === "owner" ? "站长" : actor.name, action, note, createdAt: new Date() }).run();
  }

  private update(id: string, change: Partial<StudioRevisionData>) {
    const row = this.db.select().from(studioRevisions).where(eq(studioRevisions.id, id)).get()!;
    const now = new Date();
    this.db.update(studioRevisions).set({ data: { ...row.data, ...change }, updatedAt: now }).where(eq(studioRevisions.id, id)).run();
    this.db.update(studioProjects).set({ updatedAt: now }).where(eq(studioProjects.id, row.projectId)).run();
    return this.revision(id);
  }

  private checkAssignee(id: string | null) {
    if (id && !this.db.select().from(agents).where(and(eq(agents.id, id), eq(agents.disabled, false))).get()) throw invalid("请选择一个已启用的 Agent。");
  }

  create(actor: Actor, source: StudioSource, name: string, assignedAgentId: string | null = null, voices: Voice[] = []) {
    const parsed = studioSourceSchema.safeParse(source);
    if (!parsed.success || new Set(source.beats.map((beat) => beat.id)).size !== source.beats.length) throw invalid("站点没有返回完整的演示版本，请先更新线上 Galley。");
    parsed.data.beats.forEach(validateBeatGuides);
    const assigned = actor.kind === "agent" ? actor.id : assignedAgentId;
    this.checkAssignee(assigned);
    const id = newId(), revisionId = newId(), now = new Date();
    return this.db.transaction(() => {
      this.db.insert(studioProjects).values({ id, name: cleanName(name), assignedAgentId: assigned, currentRevisionId: revisionId, createdAt: now, updatedAt: now }).run();
      this.db.insert(studioRevisions).values({ id: revisionId, projectId: id, number: 1, createdAt: now, updatedAt: now, data: {
        source: parsed.data, beats: parsed.data.beats, voices: voices.filter((voice) => parsed.data.beats.some((beat) => beat.id === voice.id && voice.hash === voiceHash(beat.text))),
        scriptStatus: "draft", videoStatus: "draft", scriptDirect: false, videoDirect: false, sampleExportId: null, note: "从文章建立项目", voiceJob: { state: "idle", message: "" },
      } }).run();
      this.event(actor, this.revision(revisionId), "创建项目");
      return this.get(actor, id);
    });
  }

  configure(actor: Actor, id: string, name: string, assignedAgentId: string | null) {
    ownerOnly(actor); const project = this.project(actor, id); this.checkAssignee(assignedAgentId);
    this.db.update(studioProjects).set({ name: cleanName(name), assignedAgentId, updatedAt: new Date() }).where(eq(studioProjects.id, id)).run();
    this.event(actor, this.revision(project.currentRevisionId), "更新项目设置");
    return this.get(actor, id);
  }

  checkConnectedSource(revision: StudioRevision, galley: string) {
    if (revision.source.galley !== galley) throw conflict("项目来自另一个站点，请先在工坊设置中连接原站点。");
  }

  checkRenderSource(revision: StudioRevision, source: StudioSource) {
    if (source.galley !== revision.source.galley || source.slug !== revision.source.slug || source.version !== revision.source.version) throw conflict("来源文章已经更新，请同步来源、检查讲稿并重新提交审查。");
  }

  synchronize(actor: Actor, id: string, revisionId: string, source: StudioSource) {
    const revision = this.current(actor, id, revisionId);
    if (source.version === revision.source.version) throw conflict("来源文章没有变化，无需同步。");
    const edits = source.beats.flatMap((beat) => {
      const previous = revision.beats.find((item) => item.id === beat.id);
      return previous ? [{ id: beat.id, text: previous.text, suggestedMs: previous.suggestedMs, guides: (previous.guides ?? []).filter((guide) => beat.targets?.some((target) => target.id === guide.targetId)) }] : [];
    });
    return this.revise(actor, id, revisionId, edits, "同步来源文章，重新审查；已移除的目标不再保留指向", source);
  }

  revise(actor: Actor, id: string, baseRevisionId: string, edits: z.infer<typeof narrationEditSchema>[], note: string, source?: StudioSource) {
    const previous = this.current(actor, id, baseRevisionId);
    if (previous.scriptStatus === "in_review" || previous.videoStatus === "in_review") throw conflict("请先撤回待审版本，或等待站长打回后再修改。");
    if (previous.voiceJob.state === "running") throw conflict("配音正在生成，请等它结束后再修改讲稿。");
    if (source && !studioSourceSchema.safeParse(source).success) throw invalid("来源版本无效。");
    if (source && (source.galley !== previous.source.galley || source.slug !== previous.source.slug)) throw invalid("修订不能替换项目所属的站点或文章。");
    const checked = z.array(narrationEditSchema).max(2000).safeParse(edits);
    if (!checked.success) throw invalid("讲稿或讲解指向格式不正确。", checked.error.flatten());
    edits = checked.data;
    const base = source?.beats ?? previous.beats;
    if (new Set(edits.map((edit) => edit.id)).size !== edits.length || edits.some((edit) => !base.some((beat) => beat.id === edit.id))) throw invalid("讲稿拍点不存在或重复，请重新读取项目。");
    const beats: Beat[] = base.map((beat) => {
      const edit = edits.find((item) => item.id === beat.id);
      const parsed = beatSchema.safeParse(edit ? { ...beat, ...edit } : beat);
      if (!parsed.success) throw invalid("每拍讲稿最多 2000 字，停留时长应在 0–120 秒之间。");
      validateBeatGuides(parsed.data);
      return parsed.data;
    });
    const revisionId = newId(), now = new Date();
    this.db.transaction(() => {
      this.db.insert(studioRevisions).values({ id: revisionId, projectId: id, number: previous.number + 1, createdAt: now, updatedAt: now, data: {
        source: source ?? previous.source, beats, voices: previous.voices.filter((voice) => beats.some((beat) => beat.id === voice.id && voice.hash === voiceHash(beat.text))),
        scriptStatus: "draft", videoStatus: "draft", scriptDirect: false, videoDirect: false, sampleExportId: null, note: note.trim(), voiceJob: { state: "idle", message: "" },
      } }).run();
      this.db.update(studioProjects).set({ currentRevisionId: revisionId, updatedAt: now }).where(eq(studioProjects.id, id)).run();
      this.event(actor, this.revision(revisionId), source ? "同步来源版本" : "修改讲稿与指向", note);
    });
    return this.get(actor, id);
  }

  private pendingComments(projectId: string, stage: "script" | "video") {
    if (this.db.select().from(studioComments).where(and(eq(studioComments.projectId, projectId), eq(studioComments.stage, stage), isNull(studioComments.reply))).all().length) throw conflict("还有批注没有回复，请逐条处理后再提交。");
  }

  private readyForVideo(revision: StudioRevision, sample?: StudioExport) {
    if (revision.scriptStatus !== "approved" || !voicesReady(revision)) throw conflict("讲稿需先通过审查，且所有配音必须与当前讲稿一致。");
    if (!sample || sample.id !== revision.sampleExportId || sample.state !== "done" || sample.revisionId !== revision.id || sample.sourceVersion !== revision.source.version) throw conflict("请先生成这个版本的完整样片。");
  }

  submit(actor: Actor, id: string, revisionId: string, stage: "script" | "video", sample?: StudioExport) {
    const revision = this.current(actor, id, revisionId);
    const status = stage === "script" ? revision.scriptStatus : revision.videoStatus;
    if (status !== "draft" && status !== "rejected") throw conflict("当前版本不能重复提交审查。");
    this.pendingComments(id, stage);
    if (stage === "video") this.readyForVideo(revision, sample);
    this.update(revisionId, stage === "script" ? { scriptStatus: "in_review" } : { videoStatus: "in_review" });
    this.event(actor, revision, stage === "script" ? "提交讲稿审查" : "提交样片审查");
    return this.get(actor, id);
  }

  withdraw(actor: Actor, id: string, revisionId: string, stage: "script" | "video") {
    const revision = this.current(actor, id, revisionId);
    if ((stage === "script" ? revision.scriptStatus : revision.videoStatus) !== "in_review") throw conflict("这个版本没有在等待审查。");
    this.update(revisionId, stage === "script" ? { scriptStatus: "draft" } : { videoStatus: "draft" });
    this.event(actor, revision, "撤回审查", stage);
    return this.get(actor, id);
  }

  decide(actor: Actor, id: string, revisionId: string, stage: "script" | "video", decision: "approve" | "reject", note: string, sample?: StudioExport) {
    ownerOnly(actor);
    const revision = this.current(actor, id, revisionId);
    if ((stage === "script" ? revision.scriptStatus : revision.videoStatus) !== "in_review") throw conflict("只有待审版本可以批准或打回。");
    if (decision === "reject" && !note.trim()) throw invalid("打回时请说明需要修改的地方。");
    if (decision === "approve") { this.pendingComments(id, stage); if (stage === "video") this.readyForVideo(revision, sample); }
    this.update(revisionId, stage === "script" ? { scriptStatus: decision === "approve" ? "approved" : "rejected" } : { videoStatus: decision === "approve" ? "approved" : "rejected" });
    this.event(actor, revision, `${decision === "approve" ? "批准" : "打回"}${stage === "script" ? "讲稿" : "样片"}`, note);
    return this.get(actor, id);
  }

  publish(actor: Actor, id: string, revisionId: string, stage: "script" | "video", note: string, sample?: StudioExport) {
    if (actor.kind !== "agent") throw forbidden("站长请通过审查操作批准版本。");
    const agent = this.db.select().from(agents).where(eq(agents.id, actor.id)).get();
    if (!agent?.canPublish || agent.disabled) throw forbidden("没有直接定稿权限，请提交审查，或由站长在 MCP 管理中授权。");
    const revision = this.current(actor, id, revisionId);
    if ((stage === "script" ? revision.scriptStatus : revision.videoStatus) === "approved") throw conflict("这个版本已经通过，不需要再次定稿。");
    this.pendingComments(id, stage);
    if (stage === "video") this.readyForVideo(revision, sample);
    this.update(revisionId, stage === "script" ? { scriptStatus: "approved", scriptDirect: true } : { videoStatus: "approved", videoDirect: true });
    this.event(actor, revision, stage === "script" ? "直接确认讲稿（未经人工审阅）" : "直接定稿（未经人工审阅）", note);
    return this.get(actor, id);
  }

  addComment(actor: Actor, id: string, revisionId: string, input: { stage: "script" | "video"; beatId?: string; timeMs?: number; body: string }) {
    ownerOnly(actor); const revision = this.current(actor, id, revisionId);
    if (!input.body.trim() || input.body.length > 2000) throw invalid("批注需要 1–2000 个字。");
    if (input.beatId && !revision.beats.some((beat) => beat.id === input.beatId)) throw invalid("批注的拍点不存在。");
    if (input.timeMs !== undefined && (!Number.isFinite(input.timeMs) || input.timeMs < 0)) throw invalid("批注时间不能小于零。");
    if ((input.stage === "script" ? revision.scriptStatus : revision.videoStatus) === "approved") throw conflict("已定稿版本不能追加审查批注，请先建立修订版本。");
    this.db.insert(studioComments).values({ id: newId(), projectId: id, revisionId, stage: input.stage, beatId: input.beatId ?? null, timeMs: input.timeMs ?? null, body: input.body.trim(), reply: null, createdAt: new Date() }).run();
    this.event(actor, revision, "添加批注", input.body);
    return this.get(actor, id);
  }

  reply(actor: Actor, id: string, commentId: string, reply: string) {
    this.project(actor, id);
    const comment = this.db.select().from(studioComments).where(and(eq(studioComments.id, commentId), eq(studioComments.projectId, id))).get();
    if (!comment) throw notFound("没有找到这条批注。");
    if (!reply.trim() || reply.length > 2000) throw invalid("请填写具体的修改说明，最多 2000 字。");
    this.db.update(studioComments).set({ reply: reply.trim() }).where(eq(studioComments.id, commentId)).run();
    this.event(actor, this.revision(comment.revisionId), "回复批注", reply);
    return this.get(actor, id);
  }

  beginVoices(actor: Actor, id: string, revisionId: string, forceIds: string[] = []) {
    const revision = this.current(actor, id, revisionId);
    if (revision.scriptStatus !== "approved") throw conflict("请先让讲稿通过审查，再生成配音。");
    if (revision.videoStatus === "in_review" || revision.videoStatus === "approved") throw conflict("这个版本的样片已经送审或定稿，请先修订讲稿。");
    if (revision.voiceJob.state === "running") throw conflict("配音正在生成。");
    if (!forceIds.length && voicesReady(revision)) throw conflict("配音已经齐全，无需重复生成。");
    if (forceIds.some((beatId) => !revision.beats.some((beat) => beat.id === beatId && beat.text))) throw invalid("只能重新生成有讲稿的拍点配音。");
    const result = this.update(revisionId, { voices: revision.voices.filter((voice) => !forceIds.includes(voice.id)), voiceJob: { state: "running", message: "正在准备配音…" }, sampleExportId: null, videoStatus: "draft" });
    this.event(actor, revision, "开始生成配音");
    return result;
  }

  voiceProgress(revisionId: string, message: string) { this.update(revisionId, { voiceJob: { state: "running", message } }); }

  saveVoice(revisionId: string, voice: Voice) {
    const revision = this.revision(revisionId);
    if (!revision.beats.some((beat) => beat.id === voice.id && voice.hash === voiceHash(beat.text))) throw conflict("配音与讲稿版本不一致，结果没有采用。");
    this.update(revisionId, { voices: [...revision.voices.filter((item) => item.id !== voice.id), voice] });
  }

  endVoices(actor: Actor, revisionId: string, error?: string) {
    const revision = this.update(revisionId, { voiceJob: error ? { state: "failed", message: "", error } : { state: "idle", message: "" } });
    this.event(actor, revision, error ? "配音失败" : "配音完成", error);
  }

  prepareRender(actor: Actor, id: string, revisionId: string) {
    const revision = this.current(actor, id, revisionId);
    if (revision.scriptStatus !== "approved" || !voicesReady(revision) || revision.voiceJob.state === "running") throw conflict("讲稿需先通过审查，且配音需要全部生成完成。");
    if (revision.videoStatus === "in_review" || revision.videoStatus === "approved") throw conflict("样片已送审或定稿，请先撤回或建立修订版本。");
    resolveGuidePlan(revision.beats, revision.voices);
    return revision;
  }

  attachRender(actor: Actor, id: string, revisionId: string, exportId: string) {
    const revision = this.current(actor, id, revisionId);
    this.update(revisionId, { sampleExportId: exportId, videoStatus: "draft", videoDirect: false });
    this.event(actor, revision, "生成 4K 样片", exportId);
  }

  checkExportAccess(actor: Actor, job: StudioExport) {
    if (job.projectId) this.project(actor, job.projectId);
    else ownerOnly(actor);
  }

  checkAudioAccess(actor: Actor, audio: string) {
    if (actor.kind === "owner") return;
    const accessible = this.list(actor).some((project) => this.get(actor, project.id).revisions.some((revision) => revision.voices.some((voice) => voice.audio === audio)));
    if (!accessible) throw notFound("没有找到你可以读取的配音。");
  }

  exportList(actor: Actor, jobs: StudioExport[]) {
    const projectIds = new Set(this.list(actor).map((project) => project.id));
    return jobs.filter((job) => actor.kind === "owner" || (job.projectId && projectIds.has(job.projectId))).map((job) => {
      const revision = job.revisionId ? this.revision(job.revisionId) : null;
      return { ...job, approval: !revision ? "historical" : revision.sampleExportId !== job.id ? "superseded" : revision.videoStatus === "approved" ? revision.videoDirect ? "direct" : "approved" : revision.videoStatus === "in_review" ? "in_review" : "sample" };
    });
  }

  prepareUnload(actor: Actor) {
    ownerOnly(actor);
    if (this.list(actor).some((project) => project.revision.voiceJob.state === "running")) throw conflict("配音正在生成，请等它结束再释放模型。");
  }

  checkExportRemoval(actor: Actor, job: StudioExport) {
    ownerOnly(actor);
    if (job.revisionId) {
      const revision = this.revision(job.revisionId);
      if (revision.sampleExportId === job.id && (revision.videoStatus === "in_review" || revision.videoStatus === "approved")) throw conflict("正在审查或已经定稿的成片不能删除。");
    }
  }
}
