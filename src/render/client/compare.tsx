"use client";

import { useRef, useState, type PointerEvent } from "react";
import { useInView } from "./in-view";

/**
 * 前后对比：两张图叠在一起，"之后"的图按分隔线的位置裁掉一部分。
 * 拖动图片任意位置或分隔线上的圆钮都可以移动分隔线；键盘用左右方向键（背后是一个滑块）。
 * 第一次滚到眼前时，分隔线从一边轻轻滑到中间，提示读者这里可以拖。
 */
export function Compare({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.5 });
  const [pos, setPos] = useState<number | null>(null);
  const dragging = useRef(false);
  const value = pos ?? (inView ? 50 : 82);

  const move = (e: PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <figure className="galley-compare-figure">
      <div
        ref={ref}
        className="galley-compare"
        data-touched={pos !== null || undefined}
        style={{ "--pos": `${value}%` } as React.CSSProperties}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => dragging.current && move(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={beforeLabel} className="galley-compare-before" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={afterLabel} className="galley-compare-after" draggable={false} />
        <span className="galley-compare-label galley-compare-label-before">{beforeLabel}</span>
        <span className="galley-compare-label galley-compare-label-after">{afterLabel}</span>
        <span className="galley-compare-handle" aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(value)}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`拖动对比${beforeLabel}和${afterLabel}`}
          className="galley-compare-range"
        />
      </div>
    </figure>
  );
}
