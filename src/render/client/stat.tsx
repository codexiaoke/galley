"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, useInView } from "./in-view";

/**
 * 关键数字：滚到眼前时从 0 滚动到目标值。
 * 取值是事实块里的一段文字，比如 "12,000"、"3.5 倍"、"98%"、"约 2 万"。
 * 找出其中第一个数字来滚动，前后的文字原样保留；找不到数字就直接显示原文。
 * 位数和千位分隔符跟原文一致，滚动时宽度不跳（等宽数字）。
 */
const NUMBER = /(-?\d[\d,]*(?:\.\d+)?)/;

export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { threshold: 0.6 });
  const match = NUMBER.exec(value);
  const [shown, setShown] = useState<string | null>(null);

  const raw = match?.[1] ?? "";
  const format = (n: number) => {
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const fixed = n.toFixed(decimals);
    if (!raw.includes(",")) return fixed;
    const [int, frac] = fixed.split(".");
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
  };

  // 脚本加载后先归零，等滚到眼前再滚动上去。没有脚本或者减少动态效果时一直显示原值。
  useEffect(() => {
    if (!raw || prefersReducedMotion()) return;
    const frame = requestAnimationFrame(() => setShown(format(0)));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  useEffect(() => {
    if (!inView || !raw || prefersReducedMotion()) return;
    const target = Number(raw.replace(/,/g, ""));
    const duration = 1400;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setShown(format(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // format 只依赖 raw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, raw]);

  if (!match) return <span ref={ref} className="galley-stat-value">{value}</span>;
  const before = value.slice(0, match.index);
  const after = value.slice(match.index + match[1].length);
  return (
    <span ref={ref} className="galley-stat-value" aria-label={value}>
      <span aria-hidden="true">
        {before}
        <span className="galley-stat-number" style={{ minWidth: `${match[1].length * 0.62}em` }}>
          {shown ?? match[1]}
        </span>
        {after && <span className="galley-stat-unit">{after}</span>}
      </span>
    </span>
  );
}
