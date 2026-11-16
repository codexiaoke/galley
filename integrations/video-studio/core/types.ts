/** 视频工坊自己的数据：项目、版本、配音、批注。演示的拍点和指向目标是和博客共用的约定，见 src/contract/narration.ts。 */
import type { Beat, GuideCue } from "../../../src/contract/narration";
import type { Production, ProductionOverride } from "./production";
import type { NarrationCheck } from "./checks";
export type { Beat, GuideCue, GuideEmphasis, GuidePlan, GuideTarget } from "../../../src/contract/narration";

export type Voice = { id: string; hash: string; audio: string; durationMs: number; cues: { start: number; end: number; text: string }[] };
/** structure：博客给的结构指纹（第 3 步以前建的项目没有，按 version 比） */
export type StudioSource = { galley: string; slug: string; title: string; present: string; version: string; structure?: string; revisedAt: string | null; beats: Beat[] };
/** 工坊里的一拍：check 为 "fallback" 表示同步时只按"第几步"对上，讲稿要人核对一遍（改过这一拍就清掉） */
export type StudioBeat = Beat & { check?: "fallback" };
/** 同步时消失的拍点：讲稿和指向留在这里，不悄悄丢掉 */
export type RemovedBeat = { id: string; kind: Beat["kind"]; title: string | null; section: string | null; written?: string; text: string; guides: GuideCue[] };
export type ReviewStatus = "draft" | "in_review" | "approved" | "rejected";
export type StudioRevisionData = {
  source: StudioSource;
  beats: StudioBeat[];
  removed?: RemovedBeat[];
  voices: Voice[];
  scriptStatus: ReviewStatus;
  videoStatus: ReviewStatus;
  scriptDirect: boolean;
  videoDirect: boolean;
  sampleExportId: string | null;
  note: string;
  voiceJob: { state: "idle" | "running" | "failed"; message: string; error?: string };
};
export type StudioRevision = StudioRevisionData & { id: string; projectId: string; number: number; createdAt: number; updatedAt: number };
export type StudioProject = { id: string; name: string; assignedAgentId: string | null; createdAt: number; updatedAt: number; currentRevisionId: string; production: ProductionOverride | null; revision: StudioRevision };
export type StudioComment = { id: string; projectId: string; revisionId: string; stage: "script" | "video"; beatId: string | null; timeMs: number | null; body: string; reply: string | null; createdAt: number };
export type StudioEvent = { id: string; projectId: string; revisionId: string; actorName: string; action: string; note: string; createdAt: number };
export type StudioProjectDetail = StudioProject & { /** 这个项目实际用的成片设置：工坊默认值加上项目自己改的 */ productionInUse: Production; /** 当前版本讲稿的检查提醒（见 checks.ts），只提醒，不拦着提交 */ checks: NarrationCheck[]; revisions: StudioRevision[]; comments: StudioComment[]; events: StudioEvent[] };
