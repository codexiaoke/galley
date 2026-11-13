"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FlowGraph } from "@/core/markup/flow";
import { prefersReducedMotion, useInView, useVisible } from "./in-view";

/**
 * 流程图。
 *
 * 排版：没有环的部分按"最长路径"分层，从左到右（窄屏放不下时改成从上到下）；
 * 同一层里按上一层的位置排，减少交叉。指回前面的连线（环）从图的下方（或右侧）绕回去。
 *
 * 动画：滚到眼前时节点按层依次浮现，连线跟着一笔画出来，说明文字随后出现；
 * 之后连线上一直有小点沿着方向流动，表示东西是怎么走的。滚出窗口时暂停，省电。
 * 鼠标停在某个节点上时，和它相连的线变亮，其余变淡。
 */

const FONT = 14;
const NODE_H = 40;
const PAD_X = 16;
const GAP_IN_LAYER = 22;
/** 竖排时，指回前面的连线从右侧绕回去，离最右边的节点多远 */
const BACK_GAP_V = 64;

/** 文字的大致宽度：中文一个字算一个字号，其他字符算 0.6 个。 */
const textWidth = (s: string, size = FONT) => [...s].reduce((w, ch) => w + (/[⺀-￯]/.test(ch) ? size : size * 0.6), 0);

type Box = { x: number; y: number; w: number; h: number; layer: number };
type Layout = {
  width: number;
  height: number;
  boxes: Box[];
  edges: { from: number; to: number; label?: string; d: string; back: boolean; mid: { x: number; y: number }; order: number }[];
  layers: number;
};

function layering(graph: FlowGraph) {
  const n = graph.nodes.length;
  const out: number[][] = Array.from({ length: n }, () => []);
  graph.edges.forEach((e, i) => out[e.from].push(i));
  // 深度优先找出指回祖先的连线（构成环的那条），排版时不按它分层。
  const state = new Array(n).fill(0);
  const back = new Set<number>();
  const visit = (v: number) => {
    state[v] = 1;
    for (const ei of out[v]) {
      const t = graph.edges[ei].to;
      if (state[t] === 1) back.add(ei);
      else if (state[t] === 0) visit(t);
    }
    state[v] = 2;
  };
  for (let v = 0; v < n; v++) if (state[v] === 0) visit(v);
  // 最长路径分层
  const layer = new Array(n).fill(0);
  for (let round = 0; round < n; round++) {
    let changed = false;
    graph.edges.forEach((e, i) => {
      if (back.has(i)) return;
      if (layer[e.to] < layer[e.from] + 1) {
        layer[e.to] = layer[e.from] + 1;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return { layer, back };
}

function layout(graph: FlowGraph, available: number): Layout & { vertical: boolean } {
  const { layer, back } = layering(graph);
  const count = Math.max(...layer) + 1;
  const widths = graph.nodes.map((name) => Math.max(72, Math.ceil(textWidth(name)) + PAD_X * 2));
  const byLayer: number[][] = Array.from({ length: count }, () => []);
  graph.nodes.forEach((_, i) => byLayer[layer[i]].push(i));
  // 同一层按前驱的平均位置排序（只排一遍，节点不多，足够了）。
  const rank = new Map<number, number>();
  byLayer.forEach((nodes, l) => {
    if (l > 0) {
      const score = (v: number) => {
        const preds = graph.edges.filter((e, i) => e.to === v && !back.has(i)).map((e) => rank.get(e.from) ?? 0);
        return preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : Infinity;
      };
      nodes.sort((a, b) => score(a) - score(b) || a - b);
    }
    nodes.forEach((v, i) => rank.set(v, i));
  });

  // 层与层之间的距离：要放得下连线上的说明文字。
  const gapAfter = (l: number, vertical: boolean) => {
    const labels = graph.edges.filter((e, i) => !back.has(i) && layer[e.from] === l && e.label).map((e) => textWidth(e.label!, 12));
    if (vertical) return labels.length ? 64 : 44;
    return Math.max(56, labels.length ? Math.max(...labels) + 28 : 0);
  };

  const build = (vertical: boolean): Layout => {
    const boxes: Box[] = new Array(graph.nodes.length);
    const hasBack = back.size > 0;
    if (!vertical) {
      const colW = byLayer.map((nodes) => Math.max(...nodes.map((v) => widths[v])));
      const colH = byLayer.map((nodes) => nodes.length * NODE_H + (nodes.length - 1) * GAP_IN_LAYER);
      const H = Math.max(...colH);
      let x = 0;
      byLayer.forEach((nodes, l) => {
        let y = (H - colH[l]) / 2;
        nodes.forEach((v) => {
          boxes[v] = { x: x + (colW[l] - widths[v]) / 2, y, w: widths[v], h: NODE_H, layer: l };
          y += NODE_H + GAP_IN_LAYER;
        });
        x += colW[l] + (l < count - 1 ? gapAfter(l, false) : 0);
      });
      return finish(boxes, x, H + (hasBack ? 44 : 0), false);
    }
    const rowW = byLayer.map((nodes) => nodes.reduce((a, v) => a + widths[v], 0) + (nodes.length - 1) * GAP_IN_LAYER);
    // 右侧留出绕回去的连线和它的说明文字的位置
    const backLabel = Math.max(0, ...graph.edges.filter((_, i) => back.has(i)).map((e) => (e.label ? textWidth(e.label, 12) / 2 + 8 : 0)));
    const reserve = hasBack ? BACK_GAP_V * 0.75 + backLabel + 4 : 0;
    const W = Math.max(...rowW) + reserve;
    let y = 0;
    byLayer.forEach((nodes, l) => {
      let x = (W - reserve - rowW[l]) / 2;
      nodes.forEach((v) => {
        boxes[v] = { x, y, w: widths[v], h: NODE_H, layer: l };
        x += widths[v] + GAP_IN_LAYER;
      });
      y += NODE_H + (l < count - 1 ? gapAfter(l, true) : 0);
    });
    return finish(boxes, W, y, true);
  };

  const finish = (boxes: Box[], width: number, height: number, vertical: boolean): Layout => {
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const edges = graph.edges.map((e, i) => {
      const a = boxes[e.from];
      const b = boxes[e.to];
      const isBack = back.has(i) || b.layer <= a.layer;
      let d: string;
      let mid: { x: number; y: number };
      if (!vertical && !isBack) {
        const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x - 6, y2 = b.y + b.h / 2;
        const mx = (x1 + x2) / 2;
        d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        mid = { x: mx, y: (y1 + y2) / 2 };
      } else if (vertical && !isBack) {
        const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y - 6;
        const my = (y1 + y2) / 2;
        d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
        mid = { x: (x1 + x2) / 2, y: my };
      } else if (!vertical) {
        // 环：从下方绕回去
        const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y + b.h + 6;
        const low = bottom + 30;
        d = `M${x1},${y1} C${x1},${low} ${x2},${low} ${x2},${y2}`;
        // 曲线正中间那一点（贝塞尔曲线 t=0.5 处），说明文字放在这里
        mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 8 + low * 0.75 };
      } else {
        // 环：从右侧绕回去
        const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x + b.w + 6, y2 = b.y + b.h / 2;
        const far = right + BACK_GAP_V;
        d = `M${x1},${y1} C${far},${y1} ${far},${y2} ${x2},${y2}`;
        mid = { x: (x1 + x2) / 8 + far * 0.75, y: (y1 + y2) / 2 };
      }
      return { ...e, d, back: isBack, mid, order: a.layer };
    });
    return { width, height, boxes, edges, layers: count };
  };

  const horizontal = build(false);
  if (horizontal.width <= available) return { ...horizontal, vertical: false };
  return { ...build(true), vertical: true };
}

export function FlowView({ graph }: { graph: FlowGraph }) {
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [available, setAvailable] = useState(720);
  const inView = useInView(ref, { threshold: 0.35 });
  const visible = useVisible(ref);
  const [hover, setHover] = useState<number | null>(null);
  const [flowing, setFlowing] = useState(false);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAvailable(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = useMemo(() => layout(graph, available), [graph, available]);
  const margin = 4;
  const vbW = L.width + margin * 2;
  const vbH = L.height + margin * 2;
  // 节点和连线依次出现的时间（秒）
  const step = 0.32;
  const settle = L.layers * step + 0.4;

  // 流动的小点：画完之后开始，看不见时暂停。
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !inView || prefersReducedMotion()) return;
    const timer = setTimeout(() => {
      setFlowing(true);
      svg.querySelectorAll<SVGAnimationElement>("animateMotion").forEach((a) => {
        try {
          a.beginElement();
        } catch {
          // 不支持时没有流动效果，不影响阅读
        }
      });
    }, settle * 1000);
    return () => clearTimeout(timer);
  }, [inView, settle, L]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (visible) svg.unpauseAnimations?.();
    else svg.pauseAnimations?.();
  }, [visible]);

  const related = (i: number) =>
    hover === null ? null : graph.edges[i].from === hover || graph.edges[i].to === hover;

  return (
    <figure className="galley-flow" ref={ref} data-in={inView || undefined} data-flowing={flowing || undefined} data-hover={hover !== null || undefined}>
      <svg
        ref={svgRef}
        viewBox={`${-margin} ${-margin} ${vbW} ${vbH}`}
        width={Math.min(vbW, available)}
        style={{ maxWidth: "100%", height: "auto" }}
        role="img"
        aria-label={graph.edges.map((e) => `${graph.nodes[e.from]}到${graph.nodes[e.to]}${e.label ? `：${e.label}` : ""}`).join("；")}
      >
        <defs>
          <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 z" className="galley-flow-arrow" />
          </marker>
        </defs>
        {L.edges.map((e, i) => (
          <g key={i} className="galley-flow-edge" data-related={related(i) ?? undefined} style={{ "--t": `${(e.order + 0.6) * step}s` } as CSSProperties}>
            <path id={`edge-${id}-${i}`} d={e.d} pathLength={1} markerEnd={`url(#arrow-${id})`} data-back={e.back || undefined} />
            <circle r="3" className="galley-flow-dot">
              <animateMotion dur={`${1.6 + (i % 3) * 0.25}s`} repeatCount="indefinite" begin="indefinite" rotate="auto">
                <mpath href={`#edge-${id}-${i}`} />
              </animateMotion>
            </circle>
          </g>
        ))}
        {L.edges.map((e, i) =>
          e.label ? (
            <g
              key={`l${i}`}
              className="galley-flow-label"
              data-related={related(i) ?? undefined}
              style={{ "--t": `${(e.order + 1) * step}s` } as CSSProperties}
              transform={`translate(${e.mid.x},${e.mid.y})`}
            >
              <rect x={-textWidth(e.label, 12) / 2 - 6} y={-10} width={textWidth(e.label, 12) + 12} height={20} rx={10} />
              <text textAnchor="middle" dy="0.35em">
                {e.label}
              </text>
            </g>
          ) : null,
        )}
        {L.boxes.map((b, i) => (
          <g
            key={i}
            className="galley-flow-node"
            data-active={hover === i || undefined}
            style={{ "--t": `${b.layer * step}s` } as CSSProperties}
            transform={`translate(${b.x},${b.y})`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <rect width={b.w} height={b.h} rx={8} />
            <text x={b.w / 2} y={b.h / 2} textAnchor="middle" dy="0.35em">
              {graph.nodes[i]}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
