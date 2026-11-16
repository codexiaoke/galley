/** 视频工坊自己的数据：项目、版本、配音、批注。演示的拍点和指向目标是和博客共用的约定，见 src/contract/narration.ts。 */
import type { Beat } from "../../../src/contract/narration";
import type { Production, ProductionOverride } from "./production";
export type { Beat, GuideCue, GuideEmphasis, GuidePlan, GuideTarget } from "../../../src/contract/narration";

export type Voice = { id: string; hash: string; audio: string; durationMs: number; cues: { start: number; end: number; text: string }[] };
export type StudioSource = { galley: string; slug: string; title: string; present: string; version: string; revisedAt: string | null; beats: Beat[] };
export type ReviewStatus = "draft" | "in_review" | "approved" | "rejected";
export type StudioRevisionData = {
  source: StudioSource;
  beats: Beat[];
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
export type StudioProjectDetail = StudioProject & { /** 这个项目实际用的成片设置：工坊默认值加上项目自己改的 */ productionInUse: Production; revisions: StudioRevision[]; comments: StudioComment[]; events: StudioEvent[] };
