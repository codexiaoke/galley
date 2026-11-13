import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printWhenDiagramsReady } from "../print-readiness";

let changed: () => void;
let disconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  disconnect = vi.fn();
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { changed = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("打印前等待图表", () => {
  it("字体和最短等待完成后仍有图未加载时不打印，全部完成后才打印一次", async () => {
    let pending = true;
    const stage = { querySelector: vi.fn(() => pending ? {} : null) } as unknown as ParentNode;
    const print = vi.fn();
    const stop = printWhenDiagramsReady(stage, Promise.resolve(), print);
    await Promise.resolve();
    vi.advanceTimersByTime(2000);
    expect(print).not.toHaveBeenCalled();
    pending = false;
    changed();
    vi.advanceTimersByTime(32);
    expect(print).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalled();
    stop();
  });

  it("没有待加载图表（包括明确失败的图）时正常打印", async () => {
    const stage = { querySelector: vi.fn(() => null) } as unknown as ParentNode;
    const print = vi.fn();
    const stop = printWhenDiagramsReady(stage, Promise.resolve(), print);
    await Promise.resolve();
    vi.advanceTimersByTime(1532);
    expect(print).toHaveBeenCalledOnce();
    expect(stage.querySelector).toHaveBeenCalledWith(".galley-mermaid:not([data-ready]):not([data-error])");
    stop();
  });

  it("图一直画不出来时最多等 15 秒，之后照常打印，且只打印一次", async () => {
    const stage = { querySelector: vi.fn(() => ({})) } as unknown as ParentNode;
    const print = vi.fn();
    const stop = printWhenDiagramsReady(stage, Promise.resolve(), print);
    await Promise.resolve();
    vi.advanceTimersByTime(14000);
    expect(print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1032);
    expect(print).toHaveBeenCalledOnce();
    // 超时之后图才画出来，不再打印第二次
    changed();
    vi.advanceTimersByTime(32);
    expect(print).toHaveBeenCalledOnce();
    stop();
  });

  it("页面离开时取消等待和已安排的打印", async () => {
    const stage = { querySelector: vi.fn(() => null) } as unknown as ParentNode;
    const print = vi.fn();
    const stop = printWhenDiagramsReady(stage, Promise.resolve(), print);
    await Promise.resolve();
    vi.advanceTimersByTime(1500);
    stop();
    vi.runAllTimers();
    expect(print).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });
});
