import { z } from "zod";
import { invalid } from "../../../src/core/errors";
import type { Beat, GuidePlan, Voice } from "./types";

import { guideEmphasisSchema, guideTargetId as targetId } from "../../../src/contract/narration";
export { guideEmphasisSchema, guidePlanSchema } from "../../../src/contract/narration";
export const GUIDE_EMPHASIS = [
  { value: "point", label: "指示 · 仅显示边框" },
  { value: "focus", label: "聚焦 · 突出目标" },
  { value: "zoom", label: "放大聚焦 · 推近重点" },
] as const;
export const guideEmphasisLabel = (value: string | undefined) => GUIDE_EMPHASIS.find((item) => item.value === (value ?? "focus"))!.label;
export const guideTargetsSchema = z.array(z.object({ id: targetId, label: z.string().min(1).max(200), appearsMs: z.number().int().nonnegative().max(600000).optional() })).max(240);
export const guidesSchema = z.array(z.object({ targetId, phrase: z.string().trim().min(1).max(2000), emphasis: guideEmphasisSchema.optional().describe("point 仅显示目标边框；focus 聚焦目标（默认）；zoom 放大并聚焦重点。不宜每句都推近。") })).max(12);
export const narrationEditSchema = z.object({
  id: z.string(), text: z.string().trim().max(2000).optional(),
  suggestedMs: z.number().min(0).max(120000).optional(),
  guides: guidesSchema.optional().describe("讲解指向，按讲稿顺序排列。targetId 取自本拍 targets；phrase 是本拍讲稿中唯一出现的一段原话。空数组清除指向。"),
});

/** 聚焦框淡入要几帧才算显示出来；目标至少要在这句话结束前这么久出现。 */
const APPEAR_MARGIN_MS = 150;

/** 标点、空白和英文大小写不影响配音字幕对齐；不猜测同义词。 */
const spoken = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function validateBeatGuides(beat: Beat) {
  const text = spoken(beat.text);
  let end = 0;
  for (const guide of beat.guides ?? []) {
    if (!beat.targets?.some((target) => target.id === guide.targetId)) throw invalid(`拍点 ${beat.id} 的指向目标已不存在，请从当前 targets 重新选择。`);
    const phrase = spoken(guide.phrase), at = text.indexOf(phrase);
    if (!phrase || at < 0 || text.indexOf(phrase, at + 1) !== -1) throw invalid(`拍点 ${beat.id} 的指向原话「${guide.phrase}」需要在讲稿中唯一出现，请选取更完整的一段话。`);
    if (at < end) throw invalid(`拍点 ${beat.id} 的指向需按讲稿顺序排列，原话不能重叠。`);
    end = at + phrase.length;
  }
}

/** 用真实字幕的起止时间定位原话。字幕段内按字数插值，跨段保留停顿；草稿明确使用估时。 */
export function resolveGuidePlan(beats: Beat[], voices: Voice[], draft = false): GuidePlan {
  return beats.filter((beat) => beat.guides?.length).map((beat) => {
    validateBeatGuides(beat);
    const voice = voices.find((voice) => voice.id === beat.id);
    if (!voice && !draft) throw invalid(`拍点 ${beat.id} 缺少配音，无法对齐讲解指针。`);
    const duration = voice?.durationMs ?? Math.max(beat.minMs, beat.suggestedMs);
    const captions = voice?.cues ?? [{ text: beat.text, start: 0, end: duration / 1000 }];
    let offset = 0;
    const segments = captions.map((cue) => {
      const text = spoken(cue.text), start = offset; offset += text.length;
      return { ...cue, text, from: start, to: offset };
    }).filter((cue) => cue.text.length);
    const text = segments.map((cue) => cue.text).join("");
    // 改稿后旧字幕不能被当成新讲稿的时间依据。
    if (text !== spoken(beat.text)) throw invalid(`拍点 ${beat.id} 的配音字幕与讲稿不一致，请重新配音后再预览或导出指针。`);
    const timeAt = (index: number, end: boolean) => {
      const cue = segments.find((cue) => end ? index > cue.from && index <= cue.to : index >= cue.from && index < cue.to)!;
      return (cue.start + (cue.end - cue.start) * (index - cue.from) / cue.text.length) * 1000;
    };
    const cues = (beat.guides ?? []).map((guide) => {
      const phrase = spoken(guide.phrase), at = text.indexOf(phrase);
      return { targetId: guide.targetId, emphasis: guide.emphasis ?? "focus", startMs: Math.max(0, Math.round(timeAt(at, false) - 450)), endMs: Math.min(duration, Math.round(timeAt(at + phrase.length, true) + 450)) };
    });
    cues.forEach((cue, i) => { if (cues[i + 1]) cue.endMs = Math.min(cue.endMs, cues[i + 1].startMs); });
    // 场景元素要等动画画出来才能指；按真实配音算出时机还早于它，导出时一定指不到。草稿估时不准，只在预览时提示。
    if (!draft) cues.forEach((cue, i) => {
      const target = beat.targets?.find((item) => item.id === cue.targetId);
      if (target?.appearsMs !== undefined && cue.endMs - APPEAR_MARGIN_MS <= target.appearsMs) {
        throw invalid(`拍点 ${beat.id} 说到「${beat.guides![i].phrase}」时，「${target.label}」还没画出来（这一拍开始约 ${(target.appearsMs / 1000).toFixed(1)} 秒后才出现，这句话在 ${(cue.endMs / 1000).toFixed(1)} 秒前就说完了）。请把这句话往后放，或指向一开始就在的目标。`);
      }
    });
    return { id: beat.id, cues };
  });
}
