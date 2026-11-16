/**
 * 博客和视频工坊之间的约定：演示里一拍一拍的结构、能指向的画面元素、镜头指向计划的格式。
 *
 * 博客按这里的格式产出（render/narration.ts、render/guide-targets.ts），演示页按这里的格式画镜头指向
 * （render/client/guide-focus.tsx）；工坊读取、编辑、存档用的也是这些类型。工坊自己的项目、版本、配音、
 * 导出的类型在 integrations/video-studio/core/types.ts，博客不认识它们。
 * 改这里的格式，两边要一起改，并给演示指纹的协议版本加一（core/presentation-version.ts）。
 */
import { z } from "zod";

/** appearsMs：场景元素在这一拍开始后多久才画出来（一开始就在时不写）。 */
export type GuideTarget = { id: string; label: string; appearsMs?: number };
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

export const guideTargetId = z.string().min(1).max(160);
export const guideEmphasisSchema = z.enum(["point", "focus", "zoom"]);
export const guidePlanSchema = z.array(z.object({ id: z.string().max(100), cues: z.array(z.object({
  targetId: guideTargetId, emphasis: guideEmphasisSchema, startMs: z.number().finite().min(0).max(600000), endMs: z.number().finite().min(0).max(600000),
})).max(12) })).max(2000);
