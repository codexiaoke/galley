"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MermaidViewer } from "./mermaid-viewer";

/**
 * Mermaid 图（时序图、类图、状态图、甘特图……）。
 *
 * Mermaid 有一两 MB，只在图快要滚进窗口时才加载，没有图的文章完全不加载。
 * 配色从页面的颜色变量里取，读者切换纸色 / 深色时重新画一遍。
 * 用 strict 安全级别：图里的文字不会被当成网页代码执行，也不能写点击跳转的脚本。
 * 画不出来时显示原来的代码；审阅预览里另外显示错误原因。
 */

type MermaidApi = (typeof import("mermaid"))["default"];
let loading: Promise<MermaidApi> | undefined;
const loadMermaid = () => (loading ??= import("mermaid").then((m) => m.default));

function themeVariables() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const paper = v("--paper", "#f6f1e6");
  const raised = v("--paper-raised", "#fbf8f0");
  const sunken = v("--paper-sunken", "#ede6d6");
  const ink = v("--ink", "#29241e");
  const soft = v("--ink-soft", "#5a5247");
  const faint = v("--ink-faint", "#81786a");
  const rule = v("--rule", "#dcd3c0");
  const accent = v("--accent", "#a63d2a");
  return {
    background: paper,
    fontFamily: v("--font-ui", "system-ui"),
    fontSize: "14px",
    primaryColor: raised,
    primaryBorderColor: faint,
    primaryTextColor: ink,
    secondaryColor: sunken,
    secondaryBorderColor: rule,
    secondaryTextColor: ink,
    tertiaryColor: paper,
    tertiaryBorderColor: rule,
    tertiaryTextColor: ink,
    lineColor: soft,
    textColor: ink,
    mainBkg: raised,
    nodeBorder: faint,
    clusterBkg: sunken,
    clusterBorder: rule,
    titleColor: ink,
    edgeLabelBackground: paper,
    noteBkgColor: sunken,
    noteBorderColor: rule,
    noteTextColor: ink,
    actorBkg: raised,
    actorBorder: faint,
    actorTextColor: ink,
    actorLineColor: rule,
    signalColor: soft,
    signalTextColor: ink,
    labelBoxBkgColor: raised,
    labelBoxBorderColor: faint,
    labelTextColor: ink,
    loopTextColor: ink,
    activationBkgColor: sunken,
    activationBorderColor: faint,
    sequenceNumberColor: paper,
    critBkgColor: accent,
    critBorderColor: accent,
    doneTaskBkgColor: rule,
    doneTaskBorderColor: faint,
    activeTaskBkgColor: sunken,
    activeTaskBorderColor: accent,
    taskBkgColor: raised,
    taskBorderColor: faint,
    taskTextColor: ink,
    taskTextDarkColor: ink,
    sectionBkgColor: sunken,
    altSectionBkgColor: paper,
    gridColor: rule,
    todayLineColor: accent,
    pie1: accent,
    pie2: v("--chart-2", "#2b62a3"),
    pie3: v("--chart-3", "#a8780e"),
    pie4: v("--chart-4", "#8a4a9c"),
    pie5: v("--chart-5", "#3c7d45"),
    pieStrokeColor: paper,
    pieTitleTextColor: ink,
    pieSectionTextColor: paper,
    pieLegendTextColor: ink,
  };
}

/** 读者切换纸色 / 深色时变化，用来触发重画 */
function useThemeVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((n) => n + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reader-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", bump);
    };
  }, []);
  return version;
}

export function MermaidDiagram({ code, review = false }: { code: string; review?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [near, setNear] = useState(false);
  const [diagram, setDiagram] = useState<{ svg: string; width: number; height: number; presentation: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const theme = useThemeVersion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 打印和离线视频都先准备所有页的图，不能等播放到这一页时才加载。
    if (el.closest(".galley-present[data-print], .galley-present[data-offline]")) {
      const frame = requestAnimationFrame(() => setNear(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: themeVariables(), flowchart: { curve: "basis" } });
        const result = await mermaid.render(`${id}-${theme}`, code);
        if (!cancelled) {
          const element = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
          const [, , width, height] = (element.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
          if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
            throw new Error("图表缺少有效尺寸。");
          }
          setDiagram({ svg: result.svg, width, height, presentation: !!ref.current?.closest(".galley-slide") });
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [near, code, id, theme]);

  return (
    <figure ref={ref} className="galley-mermaid" data-ready={diagram && !error ? true : undefined} data-error={error ? true : undefined}>
      {diagram && !error ? (
        <MermaidViewer diagram={diagram} presentation={diagram.presentation} />
      ) : error ? (
        <>
          {review && <p className="galley-trace-error">Mermaid 图画不出来：{error}</p>}
          <pre className="galley-mermaid-source">{code}</pre>
        </>
      ) : (
        <div className="galley-mermaid-placeholder" aria-hidden="true" />
      )}
    </figure>
  );
}
