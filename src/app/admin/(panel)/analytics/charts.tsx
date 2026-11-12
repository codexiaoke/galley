"use client";

import { useState, type CSSProperties } from "react";

/**
 * 运营分析页的图表。只有一种颜色（后台的主色）：这里每张图都只有一组数据，不需要用颜色区分。
 *
 * 几条规矩：柱子细一点、顶端圆角、底端平；网格线很淡；数字不逐个标在柱子上，
 * 鼠标停在哪根柱子（或者用键盘移到它）就显示哪根的数值；同样的数据在图下面还有一张表可以展开看。
 */

export type Column = { key: string; label: string; value: number; tick?: string };

/** 纵轴的最大刻度：取一个比最大值稍大的整齐数字。 */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= max) return step * pow;
  return 10 * pow;
}

export function ColumnChart({ data, unit, height = 168 }: { data: Column[]; unit: string; height?: number }) {
  const [active, setActive] = useState<number>();
  const top = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [top, top / 2, 0];
  const hovered = active === undefined ? undefined : data[active];

  return (
    <div>
      <div className="flex gap-2">
        {/* 纵轴刻度 */}
        <div className="flex w-7 shrink-0 flex-col justify-between text-right text-[11px] leading-none tabular-nums text-a-muted" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }} onMouseLeave={() => setActive(undefined)}>
          {/* 网格线：三条细线，颜色只比背景深一点 */}
          {ticks.map((t, i) => (
            <span key={t} className="absolute inset-x-0 border-t border-a-border" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} aria-hidden="true" />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              // 每根柱子占一格：整格都能触发提示，不用对准细细的柱子
              <button
                key={d.key}
                type="button"
                aria-label={`${d.label}：${d.value} ${unit}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(undefined)}
                className="group flex h-full min-w-0 flex-1 cursor-default items-end justify-center px-px focus:outline-none"
              >
                <span
                  className={`block w-full max-w-6 rounded-t-[4px] transition-opacity duration-100 ${d.value === 0 ? "bg-a-border" : "bg-a-primary"} ${
                    active !== undefined && active !== i ? "opacity-45" : ""
                  } group-focus-visible:shadow-[0_0_0_2px_var(--a-surface),0_0_0_4px_var(--a-primary)]`}
                  // 数值是 0 的日子也留一条 2px 的底，表示"这一天有记录，只是没有访问"
                  style={{ height: d.value === 0 ? 2 : `max(3px, ${(d.value / top) * 100}%)` }}
                />
              </button>
            ))}
          </div>
          {hovered && active !== undefined && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-a-text px-2.5 py-1.5 text-xs text-a-surface shadow-[0_4px_14px_rgb(15_15_15/0.18)]"
              style={
                {
                  left: `clamp(3rem, ${((active + 0.5) / data.length) * 100}%, calc(100% - 3rem))`,
                  bottom: `calc(${Math.min((hovered.value / top) * 100, 100)}% + 8px)`,
                } as CSSProperties
              }
            >
              <span className="font-semibold tabular-nums">{hovered.value}</span> {unit}
              <span className="ml-2 opacity-70">{hovered.label}</span>
            </div>
          )}
        </div>
      </div>
      {/* 横轴：只标出少数几个日期，其余的靠提示 */}
      <div className="ml-9 mt-1.5 flex text-[11px] leading-none tabular-nums text-a-muted">
        {data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {d.tick ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}
