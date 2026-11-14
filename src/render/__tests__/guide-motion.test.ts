import { describe, expect, it } from "vitest";
import { guideCameraFor, guideEase, HOME_CAMERA, mixCamera, projectRect, unprojectRect } from "../guide-motion";

describe("讲解聚焦镜头", () => {
  it("小目标适度推近，并留在画面和字幕安全范围内", () => {
    const target = { x: 950, y: 220, width: 200, height: 140 };
    const camera = guideCameraFor(target, 1600, 900);
    expect(camera.scale).toBe(1.55);
    const projected = projectRect(target, camera);
    expect(projected.x).toBeGreaterThan(0);
    expect(projected.x + projected.width).toBeLessThan(1600);
    expect(projected.y + projected.height).toBeLessThan(760);
    expect(projected.x + projected.width / 2).toBeCloseTo(800);
  });
  it("大目标或已被原场景推近的区域不重复放大，不引入画面边缘空隙", () => {
    const camera = guideCameraFor({ x: 50, y: 50, width: 1500, height: 700 }, 1600, 900);
    expect(camera).toEqual(HOME_CAMERA);
    for (const x of [0, 1500]) {
      const c = guideCameraFor({ x, y: 800, width: 100, height: 80 }, 1600, 900);
      expect(c.x).toBeLessThanOrEqual(0); expect(c.x).toBeGreaterThanOrEqual(1600 * (1 - c.scale));
      expect(c.y).toBeLessThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(900 * (1 - c.scale));
    }
  });
  it("消除已有镜头变换，重复测量不会不断放大；退出精确返回原画面", () => {
    const target = { x: 1100, y: 200, width: 220, height: 180 };
    const c = guideCameraFor(target, 1600, 900);
    const back = unprojectRect(projectRect(target, c), c);
    expect(back.x).toBeCloseTo(target.x); expect(back.width).toBeCloseTo(target.width);
    expect(guideCameraFor(back, 1600, 900).scale).toBe(c.scale);
    expect(mixCamera(c, HOME_CAMERA, guideEase(1))).toEqual(HOME_CAMERA);
  });
});
