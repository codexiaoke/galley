type Step = { duration: number; stay: number };
type StepDetail = { dir: number; wait?: number; beat?: string; anim?: number };

/** WebGL 播放器共用的逐拍时钟；离线导出主动绘制，浏览器预览由 RAF 绘制。 */
export function createScenePlayback({ element, id, steps, speed, draw, changed, finished }: {
  element: HTMLElement; id: string; steps: readonly Step[]; speed: () => number;
  draw: (index: number, elapsed: number) => boolean;
  changed: (index: number, playing: boolean) => void;
  finished?: () => void;
}) {
  let index = -1, start = performance.now(), animate = false, playing = false;
  let pausedMs: number | undefined;
  let raf = 0;
  const offline = new URLSearchParams(location.search).get("offline") === "1";
  const elapsed = () => pausedMs ?? (animate ? (performance.now() - start) * speed() : Infinity);
  const render = () => {
    const ms = elapsed();
    const moving = String(index >= 0 && ms < steps[index].duration);
    if (element.dataset.animating !== moving) element.dataset.animating = moving;
    return draw(index, ms);
  };
  const go = (next: number, animation: boolean, autoplay = false) => {
    index = Math.max(-1, Math.min(steps.length - 1, next));
    start = performance.now(); animate = animation; playing = autoplay; pausedMs = undefined;
    element.dataset.step = String(index);
    changed(index, playing); render();
  };
  const toggle = () => {
    if (playing) { pausedMs = elapsed(); playing = false; changed(index, false); }
    else if (index < 0 || (index === steps.length - 1 && elapsed() >= steps[index].duration)) go(0, true, true);
    else {
      start = performance.now() - (pausedMs ?? 0) / speed(); pausedMs = undefined;
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
    if (playing && elapsed() >= steps[index].stay) {
      if (index < steps.length - 1) go(index + 1, true, true);
      else { playing = false; changed(index, false); finished?.(); }
    }
    raf = requestAnimationFrame(tick);
  };
  element.addEventListener("galley-step", onStep);
  window.addEventListener("galley-render-frame", onFrame);
  render(); raf = requestAnimationFrame(tick);
  return { go, toggle, dispose() {
    cancelAnimationFrame(raf);
    element.removeEventListener("galley-step", onStep);
    window.removeEventListener("galley-render-frame", onFrame);
  } };
}
