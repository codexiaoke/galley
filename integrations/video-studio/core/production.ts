import { z } from "zod";
import type { Beat, Voice } from "./types";

/**
 * 成片设置：视频怎么剪，由工坊决定，不由博客决定。
 *
 * 全站一份默认值（工坊设置里改），每个项目可以单独覆盖其中几项（项目设置里改）。
 * 改了只影响之后的预览和导出，不用部署博客：时长通过网址参数 timing、镜头放大上限通过指向计划传给演示页。
 *
 * 博客只告诉工坊画面本身的性质：这一步的动画至少放多久（minMs），没有讲稿时读完画面上的字大概要多久（suggestedMs）。
 */
export const productionSchema = z.object({
  coverMs: z.number().int().min(300).max(10000).describe("封面停多久（毫秒）"),
  endingMs: z.number().int().min(300).max(10000).describe("结尾停多久（毫秒）"),
  speechTailMs: z.number().int().min(0).max(3000).describe("一句话说完后留多久再往下走（毫秒）"),
  guideLeadMs: z.number().int().min(0).max(2000).describe("镜头指向比说到那句话提前多久出现、晚多久离开（毫秒）"),
  zoomMax: z.number().min(1).max(3).describe("放大聚焦最多放大几倍"),
});
export type Production = z.infer<typeof productionSchema>;
export const productionOverrideSchema = productionSchema.partial();
export type ProductionOverride = z.infer<typeof productionOverrideSchema>;

export const PRODUCTION_DEFAULTS: Production = { coverMs: 1000, endingMs: 1000, speechTailMs: 350, guideLeadMs: 450, zoomMax: 1.55 };

/** 设置页上每一项怎么显示：毫秒的项按秒填写 */
export const PRODUCTION_FIELDS: { key: keyof Production; label: string; unit: "秒" | "倍"; step: number }[] = [
  { key: "coverMs", label: "封面停留", unit: "秒", step: 0.1 },
  { key: "endingMs", label: "结尾停留", unit: "秒", step: 0.1 },
  { key: "speechTailMs", label: "每句说完后留白", unit: "秒", step: 0.05 },
  { key: "guideLeadMs", label: "镜头指向提前量", unit: "秒", step: 0.05 },
  { key: "zoomMax", label: "放大聚焦最大倍数", unit: "倍", step: 0.05 },
];
export const toDisplay = (key: keyof Production, value: number) => (key === "zoomMax" ? value : value / 1000);
export const fromDisplay = (key: keyof Production, value: number) => (key === "zoomMax" ? value : Math.round(value * 1000));

export function effectiveProduction(defaults: Production, override: ProductionOverride | null | undefined): Production {
  return { ...defaults, ...Object.fromEntries(Object.entries(override ?? {}).filter(([, value]) => value !== undefined)) };
}

/**
 * 一拍放多久（毫秒）。
 * - 封面、结尾按成片设置，有配音时至少等话说完；
 * - 其余的拍：有配音时话说完再留一点，没有配音时按建议时长；都至少放完这一拍的动画。
 */
export function beatLength(beat: Pick<Beat, "kind" | "minMs" | "suggestedMs">, voice: Pick<Voice, "durationMs"> | undefined, production: Production): number {
  const spoken = voice ? voice.durationMs + production.speechTailMs : 0;
  if (beat.kind === "cover") return Math.max(production.coverMs, spoken);
  if (beat.kind === "ending") return Math.max(production.endingMs, spoken);
  return Math.max(beat.minMs, voice ? spoken : beat.suggestedMs);
}

/** 演示页网址参数 timing 的值：拍点:毫秒，逗号隔开（格式见博客 render/narration.ts 的 parseTiming） */
export function timingParam(beats: Beat[], voices: Voice[], production: Production): string {
  return beats.map((beat) => `${beat.id}:${beatLength(beat, voices.find((voice) => voice.id === beat.id), production)}`).join(",");
}

export function totalLength(beats: Beat[], voices: Voice[], production: Production): number {
  return beats.reduce((sum, beat) => sum + beatLength(beat, voices.find((voice) => voice.id === beat.id), production), 0);
}
