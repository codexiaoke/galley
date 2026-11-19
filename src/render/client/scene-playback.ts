type Step = { duration: number; stay: number };
type StepDetail = { dir: number; wait?: number; beat?: string; anim?: number };

/** WebGL 播放器共用的逐拍时钟；离线导出主动绘制，浏览器预览由 RAF 绘制。 */
export function createScenePlayback({ element, id, steps, speed, draw, changed, finished }: {
  element: HTMLElement; id: string; steps: readonly Step[]; speed: () => number;
  draw: (index: number, elapsed: number) => boolean;
  changed: (index: number, playing: boolean) => void;
  finished?: () => void;
}) {
  let index = -1, start = performance.now(), rate = speed(), animate = false, playing = false;
  let pausedMs: number | undefined;
  let raf = 0;
  const offline = new URLSearchParams(location.search).get("offline") === "1";
  const elapsed = () => {
    if (pausedMs !== undefined) return pausedMs;
    if (!animate) return Infinity;
    const now = performance.now(), ms = (now - start) * rate, nextRate = speed();
    if (nextRate !== rate) { start = now - ms / nextRate; rate = nextRate; }
    return ms;
  };
  const setPaused = (pause: boolean) => {
    if (pause && pausedMs === undefined) pausedMs = elapsed();
    else if (!pause && pausedMs !== undefined) {
      rate = speed(); start = performance.now() - pausedMs / rate; pausedMs = undefined;
    }
  };
  const render = () => {
    const ms = elapsed();
    const moving = String(index >= 0 && ms < steps[index].duration);
    if (element.dataset.animating !== moving) element.dataset.animating = moving;
    return draw(index, ms);
  };
  const go = (next: number, animation: boolean, autoplay = false) => {
    index = Math.max(-1, Math.min(steps.length - 1, next));
    start = performance.now(); rate = speed(); animate = animation; playing = autoplay; pausedMs = undefined;
    element.dataset.step = String(index);
    changed(index, playing); render();
  };
  const toggle = () => {
    if (playing) { setPaused(true); playing = false; changed(index, false); }
    else if (index < 0 || (index === steps.length - 1 && elapsed() >= steps[index].duration)) go(0, true, true);
    else {
      setPaused(false);
      animate = true; playing = true; changed(index, true);
    }
  };
  const onStep = (event: Event) => {
    const e = event as CustomEvent<StepDetail>;
    const next = index + (e.detail.dir > 0 ? 1 : -1);
    if (next < -1 || next >= steps.length) return;
    e.preventDefault();
    if (next >= 0) {
      e.detail.beat = `${id}.${next}`;
      e.detail.anim = steps[next].duration / speed(); e.detail.wait = steps[next].stay / speed();
    }
    go(next, e.detail.dir > 0);
  };
  const onFrame = (event: Event) => {
    const detail = (event as CustomEvent<{ changed: boolean }>).detail;
    detail.changed = render() || detail.changed;
  };
  const tick = () => {
    if (!offline) render();
    if (playing && pausedMs === undefined && elapsed() >= steps[index].stay) {
      if (index < steps.length - 1) go(index + 1, true, true);
      else { playing = false; changed(index, false); finished?.(); }
    }
    raf = requestAnimationFrame(tick);
  };
  element.addEventListener("galley-step", onStep);
  window.addEventListener("galley-render-frame", onFrame);
  render(); raf = requestAnimationFrame(tick);
  return { go, toggle, setPaused, dispose() {
    cancelAnimationFrame(raf);
    element.removeEventListener("galley-step", onStep);
    window.removeEventListener("galley-render-frame", onFrame);
  } };
}
