"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GraphNode, SiteGraph } from "@/core/services/knowledge";
import type { Positioned } from "@/render/graph-layout";

/**
 * 知识图谱的画面。坐标在服务端算好了（见 render/graph-layout.ts），这里只管画和交互：
 * 鼠标移到一个点上，和它相连的点亮起来，其余的淡下去；点一下选中，下面显示它的说明和相连的文章、概念。
 */

const LINK_LABEL: Record<string, string> = { cites: "引用", mentions: "提到", links: "链接到", related: "相关" };
const shorten = (text: string, limit: number) => ([...text].length > limit ? `${[...text].slice(0, limit).join("")}…` : text);

export function GraphView({ graph, positions, size, focus }: { graph: SiteGraph; positions: Positioned[]; size: { width: number; height: number }; focus?: string }) {
  const [hover, setHover] = useState<string>();
  const [selected, setSelected] = useState<string | undefined>(focus);
  const at = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of graph.links) {
      if (!map.has(l.source)) map.set(l.source, new Set());
      if (!map.has(l.target)) map.set(l.target, new Set());
      map.get(l.source)!.add(l.target);
      map.get(l.target)!.add(l.source);
    }
    return map;
  }, [graph.links]);

  const active = hover ?? selected;
  const lit = active ? new Set([active, ...(neighbors.get(active) ?? [])]) : undefined;
  const radius = (id: string) => 4 + Math.min(6, Math.sqrt(neighbors.get(id)?.size ?? 0) * 1.6);
  const current = selected ? byId.get(selected) : undefined;

  return (
    <div className="galley-graph">
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="galley-graph-canvas"
        role="img"
        aria-label="站点的知识图谱"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(undefined);
        }}
      >
        <g className="galley-graph-links">
          {graph.links.map((l) => {
            const a = at.get(l.source)!;
            const b = at.get(l.target)!;
            const on = lit ? lit.has(l.source) && lit.has(l.target) && (l.source === active || l.target === active) : undefined;
            return <line key={`${l.source}-${l.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} data-kind={l.kind} data-state={on === undefined ? undefined : on ? "on" : "off"} />;
          })}
        </g>
        {graph.nodes.map((node) => {
          const p = at.get(node.id)!;
          const r = radius(node.id);
          const state = lit ? (lit.has(node.id) ? "on" : "off") : undefined;
          const label = shorten(node.title, 16);
          return (
            <g
              key={node.id}
              className="galley-graph-node"
              data-kind={node.kind}
              data-state={state}
              data-selected={node.id === selected || undefined}
              transform={`translate(${p.x} ${p.y})`}
              tabIndex={0}
              role="button"
              aria-label={`${node.kind === "concept" ? "概念" : "文章"}：${node.title}`}
              onPointerEnter={() => setHover(node.id)}
              onPointerLeave={() => setHover(undefined)}
              onFocus={() => setHover(node.id)}
              onBlur={() => setHover(undefined)}
              onClick={() => setSelected(node.id === selected ? undefined : node.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(node.id === selected ? undefined : node.id);
                }
              }}
            >
              {/* 比点大一圈的透明区域，好点中 */}
              <circle r={r + 8} className="galley-graph-hit" />
              <circle r={r} className="galley-graph-dot" />
              <text y={r + 15} textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="galley-graph-legend" aria-hidden="true">
        <span data-kind="concept">概念</span>
        <span data-kind="article">文章</span>
      </div>
      {current && <Details node={current} graph={graph} byId={byId} onSelect={setSelected} />}
    </div>
  );
}

function Details({ node, graph, byId, onSelect }: { node: GraphNode; graph: SiteGraph; byId: Map<string, GraphNode>; onSelect: (id: string) => void }) {
  const related = graph.links
    .filter((l) => l.source === node.id || l.target === node.id)
    .map((l) => ({ link: l, other: byId.get(l.source === node.id ? l.target : l.source)! }))
    .sort((a, b) => (a.other.kind === b.other.kind ? 0 : a.other.kind === "article" ? -1 : 1));
  return (
    <section className="galley-graph-details" aria-live="polite">
      <p className="galley-graph-kind">{node.kind === "concept" ? "概念" : "文章"}</p>
      <h2 className="galley-graph-title">
        {node.kind === "article" ? <Link href={`/posts/${node.slug}`}>{node.title}</Link> : node.title}
        {node.kind === "concept" && node.aliases.length > 0 && <span className="galley-term-aliases">也叫 {node.aliases.join("、")}</span>}
      </h2>
      <p className="galley-graph-text">{node.kind === "concept" ? node.definition : node.summary}</p>
      {node.kind === "article" && (
        <Link href={`/posts/${node.slug}`} className="galley-term-link">
          读这篇 →
        </Link>
      )}
      {related.length > 0 && (
        <ul className="galley-graph-related">
          {related.map(({ link, other }) => (
            <li key={other.id}>
              <span className="galley-graph-relation">{relationText(node, other, link)}</span>
              {other.kind === "article" ? (
                <Link href={`/posts/${other.slug}`}>{other.title}</Link>
              ) : (
                <button type="button" onClick={() => onSelect(other.id)}>
                  {other.title}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 用一句话说清楚两个点之间是什么关系，从当前选中的点的角度。 */
function relationText(node: GraphNode, other: GraphNode, link: SiteGraph["links"][number]) {
  if (link.kind === "related") return "相关概念";
  if (link.kind === "links") return link.source === node.id ? "链接到" : "被它链接";
  if (node.kind === "concept") return link.kind === "cites" ? "引用它的文章" : "讲到它的文章";
  return other.kind === "concept" ? (link.kind === "cites" ? "引用的概念" : "讲到的概念") : LINK_LABEL[link.kind];
}
