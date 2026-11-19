import { afterEach, describe, expect, it, vi } from "vitest";
import { createScenePlayback } from "../../render/client/scene-playback";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(offline = false, speed = () => 1) {
  let now = 0;
  let tick: FrameRequestCallback = () => {};
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("location", { search: offline ? "?offline=1" : "" });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { tick = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const element = Object.assign(new EventTarget(), { dataset: {} }) as HTMLElement;
  const draw = vi.fn(() => true);
  const finished = vi.fn();
  const playback = createScenePlayback({ element, id: "demo", steps: [{ duration: 1000, stay: 2000 }, { duration: 1000, stay: 2000 }], speed, draw, changed: vi.fn(), finished });
  return { playback, element, draw, finished, advance(ms: number) { now += ms; tick(now); } };
}

describe("三维播放共用时钟", () => {
  it("PPT 暂停后冻结当前镜头，恢复不跳过余下动作", () => {
    const { playback, element, draw, advance } = setup();
    element.dispatchEvent(new CustomEvent("galley-step", { cancelable: true, detail: { dir: 1 } }));
    advance(350); playback.setPaused(true); advance(3000);
    expect(draw).toHaveBeenLastCalledWith(0, 350);
    playback.setPaused(false); advance(250);
    expect(draw).toHaveBeenLastCalledWith(0, 600);
    playback.dispose();
  });
  it("倍速改变保留当前姿态，下一镜头的等待时间也跟随倍速", () => {
    let speed = 1;
    const { playback, element, draw, advance } = setup(false, () => speed);
    playback.go(0, true); advance(300);
    speed = 2; advance(0); advance(200);
    expect(draw).toHaveBeenLastCalledWith(0, 700);
    const event = new CustomEvent("galley-step", { cancelable: true, detail: { dir: 1 } });
    element.dispatchEvent(event);
    expect(event.detail).toMatchObject({ beat: "demo.1", anim: 500, wait: 1000 });
    playback.dispose();
  });
  it("只在最后一拍自然结束时通知电影导出完成", () => {
    const { playback, finished, advance } = setup(true);
    playback.go(0, true, true); advance(2000); expect(finished).not.toHaveBeenCalled();
    advance(2000); expect(finished).toHaveBeenCalledTimes(1);
    advance(2000); expect(finished).toHaveBeenCalledTimes(1);
    playback.dispose();
  });
  it("暂停冻结当前位置，恢复后从暂停处继续", () => {
    const { playback, draw, advance } = setup();
    playback.go(0, true, true); advance(400); playback.toggle(); advance(800);
    expect(draw).toHaveBeenLastCalledWith(0, 400);
    playback.toggle(); advance(200);
    expect(draw).toHaveBeenLastCalledWith(0, 600);
    playback.dispose();
  });
  it("离线模式只在导出器请求时绘制，并报告像素是否改变", () => {
    const { playback, draw, advance, element } = setup(true);
    const step = new CustomEvent("galley-step", { cancelable: true, detail: { dir: 1 } });
    element.dispatchEvent(step); expect(step.defaultPrevented).toBe(true);
    expect(step.detail).toMatchObject({ beat: "demo.0", anim: 1000, wait: 2000 });
    draw.mockClear(); advance(500); expect(draw).not.toHaveBeenCalled();
    const frame = new CustomEvent("galley-render-frame", { detail: { changed: false } });
    window.dispatchEvent(frame); expect(draw).toHaveBeenLastCalledWith(0, 500); expect(frame.detail.changed).toBe(true);
    playback.dispose(); draw.mockClear(); window.dispatchEvent(frame); expect(draw).not.toHaveBeenCalled();
  });
});
