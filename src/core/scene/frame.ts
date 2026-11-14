import type { Scene, SceneEase, SceneTween, SceneValue } from "./types";

/**
 * 算出场景在任意时刻的画面。
 *
 * 这里是纯计算：给第几步、这一步开始后过了多少毫秒，返回每个东西当时的属性。
 * 不依赖时钟、不记状态，所以可以正着放、倒着跳、拖到任意位置，结果都一样。
 * 浏览器里的播放器（render/client/scene.tsx）每一帧调用一次。
 */

/** 文字和颜色的过渡：从 a 变到 b，p 是进度（0 到 1）。type 为真时是"打字"：b 一个字一个字出现 */
export type Blend = { a: string; b: string; p: number; type?: true };
export type FrameValue = number | string | Blend;
export type NodeFrame = Record<string, FrameValue>;
/** 每个东西（按编号）当时的属性 */
export type SceneFrame = Record<string, NodeFrame>;

const EASES: Record<Exclude<SceneEase, "type">, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // 稍微冲过头再回来
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

export const isBlend = (v: FrameValue | undefined): v is Blend => typeof v === "object" && v !== null;

const snapshotCache = new WeakMap<Scene, SceneFrame[]>();

/** 每一步开始时的画面；最后多一项，是全部播完之后的画面 */
function snapshots(scene: Scene): SceneFrame[] {
  const cached = snapshotCache.get(scene);
  if (cached) return cached;
  let current: SceneFrame = Object.fromEntries(scene.nodes.map((n) => [n.id, { ...n.props }]));
  const out: SceneFrame[] = [current];
  for (const step of scene.steps) {
    const next: SceneFrame = { ...current };
    for (const tw of step.tweens) {
      if (!next[tw.id]) continue;
      next[tw.id] = { ...next[tw.id], [tw.prop]: tw.to };
    }
    out.push(next);
    current = next;
  }
  snapshotCache.set(scene, out);
  return out;
}

function valueAt(tw: SceneTween, p: number): FrameValue {
  if (p >= 1 || tw.from === undefined) return tw.to;
  if (typeof tw.from === "number" && typeof tw.to === "number") {
    const ease = tw.ease === "type" ? EASES.linear : EASES[tw.ease];
    return tw.from + (tw.to - tw.from) * ease(p);
  }
  const a = String(tw.from);
  const b = String(tw.to);
  if (a === b) return b;
  // 颜色、形状的过渡也按缓动走；打字是匀速的
  return tw.ease === "type" ? { a, b, p, type: true } : { a, b, p: EASES[tw.ease](p) };
}

/**
 * 第 step 步开始后 t 毫秒的画面。
 * step 为 -1 是第一步之前；t 给 Infinity（或者超过这一步的时长）是这一步播完的样子。
 */
export function sceneFrame(scene: Scene, step: number, t: number): SceneFrame {
  const snaps = snapshots(scene);
  if (step < 0) return snaps[0];
  if (step >= scene.steps.length) return snaps[snaps.length - 1];
  const { tweens, duration } = scene.steps[step];
  if (t >= duration) return snaps[step + 1];
  const frame: SceneFrame = { ...snaps[step] };
  const copied = new Set<string>();
  // 按开始时间的先后：同一个属性上后开始的动作盖住先开始的
  for (const tw of tweens) {
    if (t < tw.at || !frame[tw.id]) continue;
    if (!copied.has(tw.id)) {
      frame[tw.id] = { ...frame[tw.id] };
      copied.add(tw.id);
    }
    frame[tw.id][tw.prop] = valueAt(tw, tw.dur > 0 ? (t - tw.at) / tw.dur : 1);
  }
  return frame;
}

/**
 * 整理沙箱产出的场景：每一步的动作按开始时间排好，并推出每个动作开始时的值
 * （同一个属性上，上一个动作的终点就是下一个动作的起点）。
 */
export function normalizeScene(scene: Scene): Scene {
  const state: Record<string, Record<string, SceneValue>> = Object.fromEntries(scene.nodes.map((n) => [n.id, { ...n.props }]));
  const steps = scene.steps.map((step) => {
    const tweens = step.tweens
      .map((tw, i) => ({ tw, i }))
      .sort((a, b) => a.tw.at - b.tw.at || a.i - b.i)
      .map(({ tw }) => {
        const from = state[tw.id]?.[tw.prop];
        if (state[tw.id]) state[tw.id][tw.prop] = tw.to;
        return { ...tw, from };
      });
    const end = tweens.reduce((m, tw) => Math.max(m, tw.at + tw.dur), 0);
    return { ...step, tweens, duration: Math.max(step.duration, end) };
  });
  return { ...scene, steps };
}

/** 一步的讲解读完大概要多久（毫秒）：动画播完之后再停这么久，才走下一步 */
export function readingTime(text: string): number {
  return Math.min(9000, Math.max(1800, 900 + text.replace(/\s+/g, "").length * 130));
}
