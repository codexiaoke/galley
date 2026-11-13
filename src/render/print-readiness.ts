/** 图一直画不出来（比如 Mermaid 没加载到）时，最多等这么久就照常打印，不把读者卡在提示条上。 */
const MAX_WAIT_MS = 15000;

/** 等待打印页中的 Mermaid 图完成或明确失败，再经过两帧布局后打开打印。 */
export function printWhenDiagramsReady(stage: ParentNode, fontsReady: Promise<unknown>, print: () => void): () => void {
  let cancelled = false;
  let started = false;
  let delay: ReturnType<typeof setTimeout> | undefined;
  let firstFrame = 0;
  let secondFrame = 0;
  let graceDone = false;
  const start = () => {
    if (cancelled || started) return;
    started = true;
    observer.disconnect();
    clearTimeout(giveUp);
    // 图表容器和幻灯片各有一次布局，等两帧后再进入浏览器打印流程。
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => { if (!cancelled) print(); });
    });
  };
  const check = () => {
    if (cancelled || started || !graceDone) return;
    if (stage.querySelector(".galley-mermaid:not([data-ready]):not([data-error])")) return;
    start();
  };
  const observer = new MutationObserver(check);
  observer.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-ready", "data-error"] });
  void fontsReady.then(() => {
    if (cancelled) return;
    delay = setTimeout(() => { graceDone = true; check(); }, 1500);
  });
  const giveUp = setTimeout(start, MAX_WAIT_MS);
  return () => {
    cancelled = true;
    observer.disconnect();
    if (delay) clearTimeout(delay);
    clearTimeout(giveUp);
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
  };
}
