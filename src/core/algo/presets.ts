/**
 * 读者可以切换的几组输入：presets="随机=38,27,43,3|已经有序=1,2,3,4|全部相同=5,5,5,5"
 * 组与组之间用 | 隔开，名字和输入之间用 =。每组输入事先都算好，读者点一下就换。
 * 输入里可以有逗号、冒号、斜杠（图、迷宫的写法都不受影响），只是不能有 | 和 =。
 */

export type Preset = { name: string; input: string };

export const MAX_PRESETS = 5;

export function parsePresets(text: string | undefined): { presets: Preset[]; errors: string[] } {
  if (text === undefined || text.trim() === "") return { presets: [], errors: [] };
  const presets: Preset[] = [];
  const errors: string[] = [];
  for (const part of text.split("|")) {
    const m = /^\s*([^=]{1,12}?)\s*=\s*(.+?)\s*$/.exec(part);
    if (!m) {
      errors.push(`presets 里的 "${part.trim()}" 要写成 名字=输入，例如 "已经有序=1,2,3,4"。名字最多 12 个字。`);
      continue;
    }
    presets.push({ name: m[1], input: m[2] });
  }
  if (presets.length === 1) errors.push("presets 至少要有两组，只有一组时直接用 input。");
  if (presets.length > MAX_PRESETS) errors.push(`presets 最多 ${MAX_PRESETS} 组。`);
  if (new Set(presets.map((p) => p.name)).size !== presets.length) errors.push("presets 里的名字不能重复。");
  return { presets, errors };
}

/** 实际要运行的几组输入：有 presets 时按 presets，没有时就是 input 这一组。 */
export function variantsOf(input: string | undefined, presets: string | undefined): Preset[] {
  const parsed = parsePresets(presets).presets;
  return parsed.length ? parsed : [{ name: "", input: input ?? "" }];
}
