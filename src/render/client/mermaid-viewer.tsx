"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { diagramLayout, type DiagramSize, type DiagramZoom } from "../diagram-layout";

type Diagram = DiagramSize & { svg: string };

/** 查看器只调整画布尺寸，不重写 Mermaid 的方向、节点或连线。 */
export function MermaidViewer({ diagram, presentation = false }: { diagram: Diagram; presentation?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const el = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el.showModal();
    return () => {
      el.close();
      document.body.style.overflow = overflow;
    };
  }, [expanded]);

  return (
    <>
      <DiagramViewport diagram={diagram} presentation={presentation} hideSvg={expanded} onExpand={() => {
        window.dispatchEvent(new Event("galley-diagram-open"));
        setExpanded(true);
      }} />
      <dialog ref={dialog} className="galley-diagram-dialog" aria-label="图表查看器" onClose={() => setExpanded(false)}>
        {expanded && <DiagramViewport diagram={diagram} expanded onClose={() => dialog.current?.close()} />}
      </dialog>
    </>
  );
}

function DiagramViewport({ diagram, expanded = false, presentation = false, hideSvg = false, onExpand, onClose }: {
  diagram: Diagram;
  expanded?: boolean;
  presentation?: boolean;
  hideSvg?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<DiagramSize>({ width: 320, height: 420 });
  const [zoom, setZoom] = useState<DiagramZoom>(presentation ? "fit" : "auto");
  const layout = diagramLayout(diagram, available, zoom, presentation);
  const minimum = Math.min(layout.fit, 0.25);
  const maximum = 3;
  const previousScale = useRef(layout.scale);

  useLayoutEffect(() => {
    const el = root.current!;
    const measure = () => {
      const width = viewport.current?.clientWidth ?? el.clientWidth;
      if (!width) return;
      const screenHeight = window.visualViewport?.height ?? window.innerHeight;
      const toolbarHeight = el.querySelector(".galley-diagram-toolbar")?.clientHeight ?? 48;
      let height = expanded
        ? Math.max(120, screenHeight - toolbarHeight - 48)
        : Math.max(120, Math.min(672, screenHeight * 0.7));
      if (presentation) {
        const slide = el.closest<HTMLElement>(".galley-slide");
        const body = slide?.querySelector<HTMLElement>(".galley-slide-body");
        const figure = el.closest("figure");
        if (slide && body && figure) {
          const style = getComputedStyle(slide);
          const otherContent = body.offsetHeight - figure.offsetHeight;
          height = Math.max(80, slide.clientHeight - parseFloat(style.paddingTop)
            - parseFloat(style.paddingBottom) - otherContent - toolbarHeight - 2);
        }
      }
      setAvailable((old) => old.width === width && old.height === height ? old : { width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(viewport.current!);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [expanded, presentation]);

  useLayoutEffect(() => {
    const el = viewport.current!;
    // 手动缩放保留正在阅读的中心；自动适应或全图切换从图的起点开始。
    if (typeof zoom === "number") {
      const ratio = layout.scale / previousScale.current;
      el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
      el.scrollTop = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    } else {
      el.scrollTo(0, 0);
    }
    previousScale.current = layout.scale;
  }, [layout.scale, zoom]);

  const changeZoom = (factor: number) => setZoom(Math.max(minimum, Math.min(maximum, layout.scale * factor)));
  const hasOverflow = layout.width > available.width + 1 || layout.height > available.height + 1;

  return (
    <div ref={root} className="galley-diagram-viewer" data-expanded={expanded || undefined}>
      <div className="galley-diagram-toolbar" role="group" aria-label="图表显示">
        <button type="button" aria-label="缩小图表" title="缩小" disabled={layout.scale <= minimum} onClick={() => changeZoom(1 / 1.25)}>−</button>
        <output aria-label="图表缩放比例">{Math.round(layout.scale * 100)}%</output>
        <button type="button" aria-label="放大图表" title="放大" disabled={layout.scale >= maximum} onClick={() => changeZoom(1.25)}>＋</button>
        <button type="button" aria-pressed={zoom === "auto"} onClick={() => setZoom("auto")}>自适应</button>
        <button type="button" aria-pressed={zoom === "fit"} onClick={() => setZoom("fit")}>全图</button>
        {expanded
          ? <button type="button" className="galley-diagram-expand" onClick={onClose}>关闭</button>
          : <button type="button" className="galley-diagram-expand" onClick={onExpand}>放大查看</button>}
      </div>
      <div
        ref={viewport}
        className="galley-diagram-viewport"
        role="region"
        aria-label="Mermaid 图表"
        tabIndex={hasOverflow ? 0 : undefined}
        style={{ height: layout.viewportHeight }}
      >
        <div
          className="galley-mermaid-svg"
          style={{ width: layout.width, height: layout.height }}
          // 弹窗打开时移除正文里的 SVG，避免重复 ID 让箭头引用指向另一个画布。
          dangerouslySetInnerHTML={{ __html: hideSvg ? "" : diagram.svg }}
        />
      </div>
    </div>
  );
}
