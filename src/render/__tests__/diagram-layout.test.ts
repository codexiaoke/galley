import { describe, expect, it } from "vitest";
import { diagramLayout } from "../diagram-layout";

describe("图表自适应", () => {
  it("小图按原尺寸显示，不为填满屏幕而放大", () => {
    const result = diagramLayout({ width: 260, height: 140 }, { width: 800, height: 600 });
    expect(result.scale).toBe(1);
    expect(result.viewportHeight).toBe(140);
  });

  it("纵向长图保持可读字号，展示区域受屏幕高度约束", () => {
    const result = diagramLayout({ width: 552, height: 1969 }, { width: 800, height: 600 });
    expect(result.scale * 14).toBeGreaterThanOrEqual(12);
    expect(result.viewportHeight).toBe(600);
    expect(result.height).toBeGreaterThan(result.viewportHeight);
    expect(result.width / result.height).toBeCloseTo(552 / 1969);
  });

  it("手机上的横向图不压扁，完整结构可切换全图查看", () => {
    const diagram = { width: 1800, height: 500 };
    const viewport = { width: 342, height: 590 };
    const auto = diagramLayout(diagram, viewport);
    const fit = diagramLayout(diagram, viewport, "fit");
    expect(auto.scale * 14).toBeGreaterThanOrEqual(12);
    expect(auto.width).toBeGreaterThan(viewport.width);
    expect(fit.width).toBeLessThanOrEqual(viewport.width);
    expect(fit.height).toBeLessThanOrEqual(viewport.height);
  });

  it("窗口尺寸变化时重新适应，手动缩放则保留用户选择", () => {
    const diagram = { width: 700, height: 600 };
    const desktop = diagramLayout(diagram, { width: 800, height: 672 });
    const phone = diagramLayout(diagram, { width: 342, height: 500 });
    expect(desktop.scale).toBe(1);
    expect(phone.scale).toBeLessThan(desktop.scale);
    expect(diagramLayout(diagram, { width: 342, height: 500 }, 1.5).scale).toBe(1.5);
  });
});

it("演示页按可用高度完整容纳长图，小图适当放大", () => {
  const long = diagramLayout({ width: 552, height: 1969 }, { width: 1365, height: 660 }, "fit", true);
  expect(long.height).toBeLessThanOrEqual(660);
  expect(long.width).toBeLessThanOrEqual(1365);
  const small = diagramLayout({ width: 552, height: 231 }, { width: 1365, height: 660 }, "fit", true);
  expect(small.scale).toBe(2);
});
