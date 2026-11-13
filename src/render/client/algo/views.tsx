"use client";

import type { CSSProperties } from "react";
import type { ArrayView, GraphView, GridView, HeapView, ListView, TableView, TreeView, View } from "@/core/algo/types";

/**
 * 算法动画的各种画面。每个画面只根据当前这一帧画出来；元素带着不变的 key，
 * 帧切换时位置、颜色的变化交给样式表里的过渡动画。
 * 颜色由 data-tone 决定（见样式表 .galley-algo [data-tone=...]），所有画面共用一套。
 */

export function AlgoView({ view }: { view: View }) {
  switch (view.kind) {
    case "array":
      return <ArrayStage view={view} />;
    case "grid":
      return <GridStage view={view} />;
    case "graph":
      return <GraphStage view={view} />;
    case "tree":
      return <TreeStage view={view} />;
    case "table":
      return <TableStage view={view} />;
    case "list":
      return <ListStage view={view} />;
    case "heap":
      return <HeapStage view={view} />;
  }
}

/* ---- 堆：把数组画成完全二叉树 ------------------------------------------------- */

function HeapStage({ view }: { view: HeapView }) {
  const n = view.items.length;
  const depth = Math.max(1, Math.floor(Math.log2(n)) + 1);
  const pos = (i: number) => {
    const d = Math.floor(Math.log2(i + 1));
    const k = i + 1 - 2 ** d;
    return { x: ((k + 0.5) / 2 ** d) * 100, y: 6 + (d / Math.max(1, depth - 1)) * 40 };
  };
  const outside = (i: number) => !!view.range && (i < view.range[0] || i > view.range[1]);
  // 元素按编号排，位置跟着它在数组里的下标走：交换时节点会沿着连线滑到新位置
  const at = new Map(view.items.map((item, i) => [item.id, i]));
  return (
    <div className="galley-algo-tree galley-algo-heap">
      <svg viewBox="-2 0 104 52" role="img" aria-label="堆">
        {view.items.map((_, i) => {
          if (i === 0) return null;
          const p = pos(Math.floor((i - 1) / 2));
          const c = pos(i);
          return <line key={`e${i}`} className="galley-algo-tree-edge" data-out={outside(i) || undefined} x1={p.x} y1={p.y} x2={c.x} y2={c.y} />;
        })}
        {[...view.items].sort((a, b) => a.id - b.id).map((item) => {
          const i = at.get(item.id)!;
          const p = pos(i);
          return (
            <g
              key={item.id}
              className="galley-algo-node galley-algo-heap-node"
              data-tone={view.tones[i] ?? undefined}
              data-out={outside(i) || undefined}
              style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
            >
              <circle r={3.6} />
              <text dy="0.35em" textAnchor="middle">
                {item.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---- 数组 ---------------------------------------------------------------- */

function ArrayStage({ view }: { view: ArrayView }) {
  const n = view.items.length;
  const nums = view.items.map((x) => (typeof x.value === "number" ? x.value : 0));
  const max = Math.max(1, ...nums);
  const pointerAt = new Map<number, string[]>();
  for (const p of view.pointers) pointerAt.set(p.index, [...(pointerAt.get(p.index) ?? []), p.name]);
  const outside = (i: number) => !!view.range && (i < view.range[0] || i > view.range[1]);
  // 按编号排列，位置用 transform 表示：元素换位置时会平滑地移过去，而不是瞬间跳过去。
  const order = [...view.items.map((item, index) => ({ item, index }))].sort((a, b) => a.item.id - b.item.id);

  return (
    <div className="galley-algo-array" data-style={view.style} style={{ "--algo-n": n } as CSSProperties}>
      <div className="galley-algo-cells">
        {order.map(({ item, index }) => {
          const value = item.value;
          return (
            <div
              key={item.id}
              className="galley-algo-cell"
              data-tone={view.tones[index] ?? undefined}
              data-out={outside(index) || undefined}
              style={{ "--x": index, "--h": typeof value === "number" ? Math.max(0.04, value / max) : 1 } as CSSProperties}
            >
              {view.style === "bars" ? (
                <>
                  <span className="galley-algo-bar" />
                  <span className="galley-algo-value">{value}</span>
                </>
              ) : (
                <span className="galley-algo-box">{value}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="galley-algo-indexes" aria-hidden="true">
        {view.items.map((_, i) => (
          <span key={i} data-out={outside(i) || undefined}>
            {pointerAt.has(i) ? <b>{pointerAt.get(i)!.join(" ")}</b> : view.style === "boxes" ? i : ""}
          </span>
        ))}
      </div>
      {view.aux && (
        <div className="galley-algo-aux">
          <span className="galley-algo-aux-label">{view.aux.label}</span>
          <div className="galley-algo-aux-items">
            {view.aux.items.length === 0 && <span className="galley-algo-aux-empty">空</span>}
            {view.aux.items.map((item, i) => (
              <span key={`${item.id}-${i}`} className="galley-algo-box galley-algo-aux-box" data-tone={view.aux!.tones?.[i] ?? undefined}>
                {item.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- 迷宫 ---------------------------------------------------------------- */

const GRID_TONE: Record<string, string | undefined> = { v: "visited", f: "frontier", c: "active", p: "path", S: "pivot", E: "swap" };

function GridStage({ view }: { view: GridView }) {
  return (
    <div className="galley-algo-grid" style={{ "--cols": view.cols } as CSSProperties}>
      {view.cells.split("").map((c, i) => (
        <span key={i} data-wall={c === "#" || undefined} data-tone={GRID_TONE[c]}>
          {c === "S" ? "起" : c === "E" ? "终" : ""}
        </span>
      ))}
    </div>
  );
}

/* ---- 图 ------------------------------------------------------------------ */

/** 文字的大致宽度（图的坐标单位）：中文一个字约 3.8，其他字符约 2.2 */
const nodeTextWidth = (s: string) => [...s].reduce((w, ch) => w + (/[\u2E80-\uFFEF]/.test(ch) ? 3.8 : 2.2), 0);

function GraphStage({ view }: { view: GraphView }) {
  const R = 5.6;
  // 名字短的画成圆，长的画成胶囊，宽度随名字
  const half = view.nodes.map((n) => Math.max(R, nodeTextWidth(n.name) / 2 + 2.4));
  // 连线停在节点边上（按椭圆算），有向边再多留一点给箭头
  const edge = (i: number, j: number, directed: boolean) => {
    const a = view.nodes[i];
    const b = view.nodes[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const reach = (k: number) => 1 / Math.hypot(ux / half[k], uy / R);
    const end = reach(j) + (directed ? 1.6 : 0);
    return { x1: a.x + ux * reach(i), y1: a.y + uy * reach(i), x2: b.x - ux * end, y2: b.y - uy * end };
  };
  // 画布的范围：所有节点加上边距（节点下方的小字也要留位置）
  const minX = Math.min(...view.nodes.map((n, i) => n.x - half[i])) - 4;
  const maxX = Math.max(...view.nodes.map((n, i) => n.x + half[i])) + 4;
  const minY = Math.min(...view.nodes.map((n) => n.y)) - R - 6;
  const maxY = Math.max(...view.nodes.map((n) => n.y)) + R + 8;
  return (
    <svg className="galley-algo-graph" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="图">
      <defs>
        <marker id="galley-algo-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" />
        </marker>
      </defs>
      {view.edges.map((e, i) => {
        const a = view.nodes[e.from];
        const b = view.nodes[e.to];
        const l = edge(e.from, e.to, e.directed);
        return (
          <g key={i} className="galley-algo-edge" data-tone={e.tone ?? undefined}>
            <line {...l} markerEnd={e.directed ? "url(#galley-algo-arrow)" : undefined} />
            {(e.weight !== undefined || e.label) && (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} dy="0.35em" textAnchor="middle" className="galley-algo-weight" data-label={e.label ? true : undefined}>
                {[e.label, e.weight].filter((x) => x !== undefined).join(" ")}
              </text>
            )}
          </g>
        );
      })}
      {view.nodes.map((n, i) => {
        // 节点外侧的小字（距离、顺序）放在远离圆心的方向。
        // 分层排列时（所有节点都不在圆上）小字放在节点下方，排成圆时放在远离圆心的一侧
        const onCircle = Math.abs(Math.hypot(n.x - 50, n.y - 50) - 40) < 0.5;
        const dx = onCircle ? n.x - 50 : 0;
        const dy = onCircle ? n.y - 50 : 1;
        const len = Math.hypot(dx, dy) || 1;
        return (
          <g key={i} className="galley-algo-node" data-tone={n.tone ?? undefined}>
            {half[i] > R ? <rect x={n.x - half[i]} y={n.y - R} width={half[i] * 2} height={R * 2} rx={R} /> : <circle cx={n.x} cy={n.y} r={R} />}
            <text x={n.x} y={n.y} dy="0.35em" textAnchor="middle">
              {n.name}
            </text>
            {n.label && (
              <text x={n.x + (dx / len) * (onCircle ? 10.5 : 9.5)} y={n.y + (dy / len) * (onCircle ? 10.5 : 9.5)} dy="0.35em" textAnchor="middle" className="galley-algo-node-label">
                {n.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---- 树 ------------------------------------------------------------------ */

function TreeStage({ view }: { view: TreeView }) {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const y = (v: number) => v * 0.62;
  return (
    <div className="galley-algo-tree">
      <svg viewBox="-2 0 104 64" role="img" aria-label="二叉树">
        {view.edges.map((e) => {
          const a = byId.get(e.from)!;
          const b = byId.get(e.to)!;
          return <line key={`${e.from}-${e.to}`} className="galley-algo-tree-edge" data-tone={e.tone ?? undefined} x1={a.x} y1={y(a.y)} x2={b.x} y2={y(b.y)} />;
        })}
        {[...view.nodes].sort((a, b) => a.id - b.id).map((n) => (
          // 节点用 transform 定位：加入新节点、整棵树重新排开时，旧节点会平滑地挪到新位置
          <g key={n.id} className="galley-algo-node galley-algo-tree-node" data-tone={n.tone ?? undefined} style={{ transform: `translate(${n.x}px, ${y(n.y)}px)` }}>
            <circle r={3.6} />
            <text dy="0.35em" textAnchor="middle">
              {n.value}
            </text>
          </g>
        ))}
      </svg>
      {view.output && (
        <div className="galley-algo-aux">
          <span className="galley-algo-aux-label">{view.output.label}</span>
          <div className="galley-algo-aux-items">
            {view.output.items.length === 0 && <span className="galley-algo-aux-empty">空</span>}
            {view.output.items.map((v, i) => (
              <span key={i} className="galley-algo-box galley-algo-aux-box" data-tone="sorted">
                {v}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- 表格（动态规划） ------------------------------------------------------ */

function TableStage({ view }: { view: TableView }) {
  return (
    <div className="galley-algo-table-wrap">
      <table className="galley-algo-table">
        <thead>
          <tr>
            <th />
            {view.colHead.map((h, j) => (
              <th key={j}>{h || "∅"}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rowHead.map((h, i) => (
            <tr key={i}>
              <th>{h || "∅"}</th>
              {view.cells[i].map((c, j) => (
                <td key={j} data-tone={view.tones[`${i},${j}`]} data-empty={c === null || undefined}>
                  {c ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- 链表 ---------------------------------------------------------------- */

function ListStage({ view }: { view: ListView }) {
  const W = 40;
  const H = 30;
  const GAP = 34;
  const n = view.nodes.length;
  const x = (i: number) => 10 + i * (W + GAP);
  const width = x(n - 1) + W + 10;
  const top = 34;
  const pointers = new Map<number, string[]>();
  for (const p of view.pointers) if (p.index !== null) pointers.set(p.index, [...(pointers.get(p.index) ?? []), p.name]);
  return (
    <svg className="galley-algo-list" viewBox={`0 0 ${width} 110`} role="img" aria-label="链表">
      <defs>
        <marker id="galley-algo-list-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" />
        </marker>
      </defs>
      {view.nodes.map((node, i) => {
        const target = view.next[i];
        let d: string;
        if (target === null) d = "";
        else if (target > i) d = `M${x(i) + W},${top + H / 2} L${x(target) - 3},${top + H / 2}`;
        else {
          // 指向左边的箭头从上方绕过去，和原来向右的位置分开
          const x1 = x(i) + W * 0.3;
          const x2 = x(target) + W * 0.7;
          d = `M${x1},${top} C${x1},${top - 22} ${x2},${top - 22} ${x2},${top - 3}`;
        }
        return (
          <g key={node.id} className="galley-algo-list-node" data-tone={view.tones[i] ?? undefined}>
            {d && <path d={d} className="galley-algo-list-arrow" markerEnd="url(#galley-algo-list-arrow)" />}
            {target === null && (
              <text x={x(i) + W / 2} y={top + H + 14} textAnchor="middle" className="galley-algo-null">
                → null
              </text>
            )}
            <rect x={x(i)} y={top} width={W} height={H} rx={5} />
            <text x={x(i) + W / 2} y={top + H / 2} dy="0.35em" textAnchor="middle" className="galley-algo-list-value">
              {node.value}
            </text>
            {pointers.has(i) && (
              <text x={x(i) + W / 2} y={top + H + (target === null ? 30 : 16)} textAnchor="middle" className="galley-algo-list-pointer">
                {pointers.get(i)!.join(" ")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
