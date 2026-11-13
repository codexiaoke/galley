/** 图形按原方向缩放；默认保住 14px 标签的可读性，过长部分交给视窗滚动。 */
export type DiagramSize = { width: number; height: number };
export type DiagramZoom = "auto" | "fit" | number;

export function diagramLayout(diagram: DiagramSize, viewport: DiagramSize, zoom: DiagramZoom = "auto", presentation = false) {
  const fit = Math.min(presentation ? 2 : 1, viewport.width / diagram.width, viewport.height / diagram.height);
  const readable = 12 / 14;
  const scale = typeof zoom === "number" ? zoom : zoom === "fit" ? fit : Math.max(readable, fit);
  return {
    fit,
    scale,
    width: diagram.width * scale,
    height: diagram.height * scale,
    viewportHeight: Math.min(viewport.height, diagram.height * scale),
  };
}
