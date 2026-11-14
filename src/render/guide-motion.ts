/** 讲解镜头的几何与缓动，时间全部由播放时钟提供，离线渲染不使用 CSS transition。 */
export type GuidePoint = { x: number; y: number };
export type GuideRect = GuidePoint & { width: number; height: number };
export type GuideCamera = GuidePoint & { scale: number };
export const HOME_CAMERA: GuideCamera = { x: 0, y: 0, scale: 1 };
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function guideEase(progress: number) {
  const t = clamp(progress, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
export const mixCamera = (a: GuideCamera, b: GuideCamera, t: number): GuideCamera => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), scale: mix(a.scale, b.scale, t) });
export const mixRect = (a: GuideRect, b: GuideRect, t: number): GuideRect => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), width: mix(a.width, b.width, t), height: mix(a.height, b.height, t) });
export const projectRect = (r: GuideRect, c: GuideCamera): GuideRect => ({ x: r.x * c.scale + c.x, y: r.y * c.scale + c.y, width: r.width * c.scale, height: r.height * c.scale });
export const unprojectRect = (r: GuideRect, c: GuideCamera): GuideRect => ({ x: (r.x - c.x) / c.scale, y: (r.y - c.y) / c.scale, width: r.width / c.scale, height: r.height / c.scale });

/** 保留周边关系与字幕空间。目标已被原场景镜头放大时，自动限制二次推近。 */
export function guideCameraFor(target: GuideRect, width: number, height: number): GuideCamera {
  const scale = clamp(Math.min((width - 160) / (target.width + 100), (height - 210) / (target.height + 100)), 1, 1.55);
  return {
    scale,
    x: clamp(width / 2 - (target.x + target.width / 2) * scale, width * (1 - scale), 0),
    y: clamp((height - 140) / 2 - (target.y + target.height / 2) * scale, height * (1 - scale), 0),
  };
}
