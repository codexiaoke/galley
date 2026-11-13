"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useInView } from "./in-view";

/**
 * 图表：横向柱状图、折线图、环形图。滚到眼前时播放一次生长动画：
 * 柱子从左边长出来（一根接一根），折线一笔画出来再落下数据点，环形一段接一段转出来。
 * 动画都写在样式表里，由根元素上的 data-in 触发；减少动态效果时直接显示最终状态。
 *
 * 配色按系列的顺序固定取 --chart-1 到 --chart-5（浅色和深色阅读模式各一套，都校验过色弱可辨），
 * 不随数据多少重新分配。只有一个系列时柱子用墨色、折线用朱红，标题已经说明了它是什么。
 */

type Cell = string | number;
type Props = { type: "bar" | "line" | "pie"; columns: string[]; rows: Cell[][]; unit?: string; label?: string };

const MAX_SERIES = 5;
const num = (v: Cell) => (typeof v === "number" ? v : Number.NaN);
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("zh-CN") : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 }));

export function ChartView({ type, columns, rows, unit, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  // 数值列：至少有一个数字的列。超过五列的不画，表格里仍然能看到。
  const series = useMemo(
    () =>
      columns
        .map((name, i) => ({ name, index: i }))
        .slice(1)
        .filter((c) => rows.some((r) => Number.isFinite(num(r[c.index]))))
        .slice(0, MAX_SERIES),
    [columns, rows],
  );
  const data = rows.filter((r) => series.some((s) => Number.isFinite(num(r[s.index]))));
  if (series.length === 0 || data.length === 0) return <ChartTable columns={columns} rows={rows} />;

  const props = { series, data, unit };
  return (
    <div ref={ref} className="galley-chart" data-type={type} data-in={inView || undefined} role="img" aria-label={label ?? "图表"}>
      {type === "line" && data.length > 1 ? <LineChart {...props} /> : type === "pie" ? <PieChart {...props} /> : <BarChart {...props} />}
      <ChartTable columns={columns} rows={rows} hidden />
    </div>
  );
}

type Series = { name: string; index: number }[];
type ChartProps = { series: Series; data: Cell[][]; unit?: string };

const color = (i: number, single: boolean, type: "bar" | "line" | "pie") =>
  single && type !== "pie" ? (type === "bar" ? "var(--ink)" : "var(--accent)") : `var(--chart-${(i % MAX_SERIES) + 1})`;

function Legend({ series, type }: { series: Series; type: "bar" | "line" }) {
  if (series.length < 2) return null;
  return (
    <div className="galley-chart-legend" aria-hidden="true">
      {series.map((s, i) => (
        <span key={s.name}>
          <i data-shape={type} style={{ background: color(i, false, type) }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** 读屏软件和复制时用的表格；视觉上隐藏。 */
function ChartTable({ columns, rows, hidden = false }: { columns: string[]; rows: Cell[][]; hidden?: boolean }) {
  return (
    <div className={hidden ? "sr-only" : "galley-table-wrap"}>
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- 横向柱状图 ---------------------------------------------------------- */

function BarChart({ series, data, unit }: ChartProps) {
  const single = series.length === 1;
  const max = Math.max(1e-9, ...data.flatMap((r) => series.map((s) => num(r[s.index])).filter(Number.isFinite)));
  return (
    <div aria-hidden="true">
      <Legend series={series} type="bar" />
      <div className="galley-bars" data-grouped={!single || undefined}>
        {data.map((row, i) => (
          <div key={i} className="galley-bar-row" style={{ "--i": i } as CSSProperties}>
            <span className="galley-bar-label" title={String(row[0])}>{row[0]}</span>
            <span className="galley-bar-track">
              {series.map((s, j) => {
                const v = num(row[s.index]);
                const w = Number.isFinite(v) ? Math.max(0, v / max) : 0;
                return (
                  <span key={s.name} className="galley-bar-line">
                    <span
                      className="galley-bar"
                      style={{ "--w": w, background: color(j, single, "bar") } as CSSProperties}
                      title={`${s.name}：${Number.isFinite(v) ? fmt(v) : "—"}${unit ?? ""}`}
                    />
                    <span className="galley-bar-value">{Number.isFinite(v) ? fmt(v) : ""}</span>
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- 折线图 -------------------------------------------------------------- */

function useWidth(ref: React.RefObject<HTMLElement | null>, fallback = 640) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** 坐标轴的刻度：取 1、2、5 乘以 10 的幂，四五格左右。 */
function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

const shortNumber = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e8) return `${fmt(n / 1e8)}亿`;
  if (a >= 1e4) return `${fmt(n / 1e4)}万`;
  return fmt(n);
};

function LineChart({ series, data, unit }: ChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const width = useWidth(boxRef);
  const [hover, setHover] = useState<number | null>(null);
  const single = series.length === 1;
  const height = Math.round(Math.min(320, Math.max(200, width * 0.48)));
  const pad = { top: 16, right: 16, bottom: 30, left: 44 };
  const values = data.flatMap((r) => series.map((s) => num(r[s.index]))).filter(Number.isFinite);
  const minV = Math.min(0, ...values);
  const ticks = niceTicks(minV, Math.max(...values));
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
  // 类别标签太挤时隔几个显示一个。
  const every = Math.max(1, Math.ceil((data.length * 64) / innerW));

  const paths = series.map((s) => {
    let d = "";
    data.forEach((r, i) => {
      const v = num(r[s.index]);
      if (!Number.isFinite(v)) return;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  });

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.left) / innerW) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  };

  return (
    <div aria-hidden="true">
      <Legend series={series} type="line" />
      <div ref={boxRef} className="galley-line-box">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t} className="galley-axis">
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} data-zero={t === 0 || undefined} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {shortNumber(t)}
              </text>
            </g>
          ))}
          {data.map((r, i) =>
            i % every === 0 || i === data.length - 1 ? (
              <text key={i} className="galley-axis-x" x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
                {String(r[0])}
              </text>
            ) : null,
          )}
          {hover !== null && <line className="galley-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} />}
          {paths.map((d, j) => (
            <path key={j} d={d} pathLength={1} className="galley-line" style={{ stroke: color(j, single, "line"), "--j": j } as CSSProperties} />
          ))}
          {series.map((s, j) =>
            data.map((r, i) => {
              const v = num(r[s.index]);
              if (!Number.isFinite(v)) return null;
              return (
                <circle
                  key={`${j}-${i}`}
                  className="galley-dot"
                  data-active={hover === i || undefined}
                  cx={x(i)}
                  cy={y(v)}
                  r={hover === i ? 4.5 : 3}
                  style={{ fill: color(j, single, "line"), "--d": i / Math.max(1, data.length - 1) } as CSSProperties}
                />
              );
            }),
          )}
        </svg>
        {hover !== null && (
          <div
            className="galley-tooltip"
            style={{ left: x(hover), top: pad.top, "--flip": x(hover) > width * 0.6 ? 1 : 0 } as CSSProperties}
          >
            <strong>{String(data[hover][0])}</strong>
            {series.map((s, j) => {
              const v = num(data[hover][s.index]);
              return (
                <span key={s.name}>
                  {!single && <i style={{ background: color(j, single, "line") }} />}
                  {!single && <span className="galley-tooltip-name">{s.name}</span>}
                  <b>{Number.isFinite(v) ? `${fmt(v)}${unit ?? ""}` : "—"}</b>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- 环形图 -------------------------------------------------------------- */

function PieChart({ series, data, unit }: ChartProps) {
  const s = series[0];
  const items = data
    .map((r) => ({ name: String(r[0]), value: num(r[s.index]) }))
    .filter((d) => Number.isFinite(d.value) && d.value > 0);
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const [hover, setHover] = useState<number | null>(null);
  const gap = items.length > 1 ? 0.8 : 0; // 段与段之间留一点缝，单位是周长的百分比
  const segments: (typeof items[number] & { i: number; pct: number; offset: number })[] = [];
  for (const [i, d] of items.entries()) {
    const offset = i === 0 ? 0 : segments[i - 1].offset + segments[i - 1].pct;
    segments.push({ ...d, i, pct: (d.value / total) * 100, offset });
  }
  // 中间默认显示占比最大的一项，鼠标停在哪一段就换成哪一段。
  const largest = segments.length ? segments.reduce((a, b) => (b.value > a.value ? b : a)).i : 0;
  const shown = hover ?? largest;
  // 数据本身就是百分比时，不再重复显示一列算出来的占比。
  const isPercent = unit === "%";

  return (
    <div className="galley-pie" data-percent={isPercent || undefined} aria-hidden="true">
      <div className="galley-pie-ring">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="46" className="galley-pie-track" pathLength={100} />
          {segments.map((seg) => (
            <circle
              key={seg.i}
              cx="60"
              cy="60"
              r="46"
              pathLength={100}
              className="galley-pie-seg"
              data-dim={hover !== null && hover !== seg.i ? true : undefined}
              style={
                {
                  stroke: color(seg.i, false, "pie"),
                  "--len": Math.max(0, seg.pct - gap),
                  "--off": -seg.offset,
                  "--i": seg.i,
                } as CSSProperties
              }
              onPointerEnter={() => setHover(seg.i)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="galley-pie-center">
          {segments[shown] && (
            <>
              <b>{segments[shown].pct.toFixed(segments[shown].pct < 10 ? 1 : 0)}%</b>
              <span>{segments[shown].name}</span>
            </>
          )}
        </div>
      </div>
      <ul className="galley-pie-legend">
        {segments.map((seg) => (
          <li
            key={seg.i}
            data-dim={hover !== null && hover !== seg.i ? true : undefined}
            onPointerEnter={() => setHover(seg.i)}
            onPointerLeave={() => setHover(null)}
            style={{ "--i": seg.i } as CSSProperties}
          >
            <i style={{ background: color(seg.i, false, "pie") }} />
            <span className="galley-pie-name">{seg.name}</span>
            <span className="galley-pie-value">
              {fmt(seg.value)}
              {unit ?? ""}
            </span>
            {!isPercent && <span className="galley-pie-pct">{seg.pct.toFixed(seg.pct < 10 ? 1 : 0)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
