import type { Scene3D, Scene3DValue } from "./schema";

/** 绝对时间求值，无累积状态，拖动、回退、配音伸缩和逐帧导出使用同一结果。 */
export function scene3dFrame(scene: Scene3D, time: number): Record<string, Record<string, Scene3DValue>> {
  const frame: Record<string, Record<string, Scene3DValue>> = {};
  for (const track of scene.tracks) {
    let lo = 0, hi = track.times.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (track.times[mid] <= time) lo = mid + 1; else hi = mid; }
    const a = Math.max(0, lo - 1), b = Math.min(track.times.length - 1, lo);
    let p = a === b ? 0 : Math.max(0, Math.min(1, (time - track.times[a]) / (track.times[b] - track.times[a])));
    if (track.interpolation === "smooth") p = p * p * (3 - 2 * p);
    const from = track.values[a], to = track.values[b];
    let value: Scene3DValue = from;
    if (track.interpolation !== "step") {
      if (typeof from === "number" && typeof to === "number") value = from + (to - from) * p;
      else if (Array.isArray(from) && Array.isArray(to)) {
        const sign = track.property === "quaternion" && from.reduce((sum, v, i) => sum + v * to[i], 0) < 0 ? -1 : 1;
        const values = from.map((v, i) => v + (sign * to[i] - v) * p);
        if (track.property === "quaternion") { const length = Math.hypot(...values); values.forEach((v, i) => { values[i] = v / length; }); }
        value = values as [number, number, number];
      }
    }
    (frame[track.target] ??= {})[track.property] = value;
  }
  return frame;
}
