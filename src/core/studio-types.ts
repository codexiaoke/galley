/** 视频制作的交换格式；浏览器、核心流程和渲染器共用。 */
export type GuideTarget = { id: string; label: string };
export type GuideEmphasis = "point" | "focus" | "zoom";
export type GuideCue = { targetId: string; phrase: string; emphasis?: GuideEmphasis };
export type GuidePlan = { id: string; cues: { targetId: string; startMs: number; endMs: number; emphasis: GuideEmphasis }[] }[];
export type Beat = {
  id: string;
  kind: "cover" | "page" | "step" | "ending";
  page: number;
  title: string | null;
  section: string | null;
  text: string;
  written?: string;
  suggestedMs: number;
  minMs: number;
  selfPaced?: true;
  targets?: GuideTarget[];
  guides?: GuideCue[];
};

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
export type StudioProject = { id: string; name: string; assignedAgentId: string | null; createdAt: number; updatedAt: number; currentRevisionId: string; revision: StudioRevision };
export type StudioComment = { id: string; projectId: string; revisionId: string; stage: "script" | "video"; beatId: string | null; timeMs: number | null; body: string; reply: string | null; createdAt: number };
export type StudioEvent = { id: string; projectId: string; revisionId: string; actorName: string; action: string; note: string; createdAt: number };
export type StudioProjectDetail = StudioProject & { revisions: StudioRevision[]; comments: StudioComment[]; events: StudioEvent[] };
