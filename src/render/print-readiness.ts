/** 等待打印页中的 Mermaid 图完成或明确失败，再经过两帧布局后打开打印。 */
export function printWhenDiagramsReady(stage: ParentNode, fontsReady: Promise<unknown>, print: () => void): () => void {
  let cancelled = false;
  let delay: ReturnType<typeof setTimeout> | undefined;
  let firstFrame = 0;
  let secondFrame = 0;
  let graceDone = false;
  const check = () => {
    if (cancelled || !graceDone) return;
    if (stage.querySelector(".galley-mermaid:not([data-ready]):not([data-error])")) return;
    observer.disconnect();
    // 图表容器和幻灯片各有一次布局，等两帧后再进入浏览器打印流程。
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => { if (!cancelled) print(); });
    });
  };
  const observer = new MutationObserver(check);
  observer.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-ready", "data-error"] });
  void fontsReady.then(() => {
    if (cancelled) return;
    delay = setTimeout(() => { graceDone = true; check(); }, 1500);
  });
  return () => {
    cancelled = true;
    observer.disconnect();
    if (delay) clearTimeout(delay);
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
  };
}
