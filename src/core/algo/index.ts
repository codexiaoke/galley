import { DP } from "./dp";
import { GRAPH } from "./graph";
import { GRID } from "./grid";
import { SEARCH } from "./search";
import { SORTING } from "./sorting";
import { TREE } from "./tree";
import { parsePresets, variantsOf } from "./presets";
import { MAX_FRAMES, type AlgoDef, type AlgoInput, type Frame } from "./types";

export type { AlgoDef, AlgoInput, Frame } from "./types";

/** 所有可以在文章里演示的算法。新增算法时加在这里，组件清单和校验会自动跟上。 */
export const ALGORITHMS: AlgoDef[] = [...SORTING, ...SEARCH, ...GRID, ...GRAPH, ...TREE, ...DP];

const byName = new Map(ALGORITHMS.map((a) => [a.name, a]));

export const getAlgorithm = (name: string) => byName.get(name);

export const ALGORITHM_NAMES = ALGORITHMS.map((a) => a.name) as [string, ...string[]];

/** 检查作者给的输入，返回错误信息。 */
export function checkAlgorithm(name: string, input: AlgoInput): string[] {
  const def = byName.get(name);
  if (!def) return [`没有名为 ${name} 的算法。`];
  return def.check(input).map((e) => `${def.label}：${e}`);
}

export type AlgoRun = { def: AlgoDef; frames: Frame[] } | { def?: AlgoDef; error: string };

/** 生成动画的每一帧。输入有问题时返回错误（正常情况下保存时已经挡住了）。 */
export function runAlgorithm(name: string, input: AlgoInput): AlgoRun {
  const def = byName.get(name);
  if (!def) return { error: `没有名为 ${name} 的算法。` };
  const errors = def.check(input);
  if (errors.length) return { def, error: errors.join(" ") };
  const frames = def.run(input);
  return { def, frames: frames.length > MAX_FRAMES ? [...frames.slice(0, MAX_FRAMES - 1), frames[frames.length - 1]] : frames };
}

/** 给 Agent 看的算法清单：名字、中文名、输入怎么写、例子。 */
export function describeAlgorithms() {
  return ALGORITHMS.map((a) => ({
    type: a.name,
    label: a.label,
    group: a.group,
    input: a.inputHelp,
    example: `::algo{type=${a.name} input="${a.example.input}"${a.example.target ? ` target=${a.example.target}` : ""}${a.example.start ? ` start=${a.example.start}` : ""}}`,
  }));
}

export type AlgoParams = { input?: string; presets?: string; target?: string; start?: string };

/**
 * 检查一个或几个算法在每组输入下能不能运行（algo 组件和 race 组件共用）。
 * 有 presets 时检查每一组，错误信息里带上是哪一组。
 */
export function checkAlgorithmParams(names: string[], p: AlgoParams): string[] {
  const { errors } = parsePresets(p.presets);
  if (errors.length) return errors;
  if (!p.presets && !p.input) return ["需要 input（或者用 presets 给几组输入让读者切换）。"];
  const out: string[] = [];
  for (const v of variantsOf(p.input, p.presets)) {
    for (const name of names) {
      for (const e of checkAlgorithm(name, { input: v.input, target: p.target, start: p.start })) out.push(v.name ? `「${v.name}」这组输入：${e}` : e);
    }
  }
  return out;
}

/** 每组输入各生成一份动画。 */
export function runAlgorithmVariants(name: string, p: AlgoParams): { def?: AlgoDef; variants: { name: string; frames: Frame[] }[]; error?: string } {
  const variants: { name: string; frames: Frame[] }[] = [];
  let def: AlgoDef | undefined;
  for (const v of variantsOf(p.input, p.presets)) {
    const run = runAlgorithm(name, { input: v.input, target: p.target, start: p.start });
    def = run.def;
    if ("error" in run) return { def, variants, error: v.name ? `「${v.name}」：${run.error}` : run.error };
    variants.push({ name: v.name, frames: run.frames });
  }
  return { def, variants };
}
