"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 元素第一次进入窗口时返回 true，之后一直是 true（动画只播一次）。
 * 读者设置了"减少动态效果"时直接返回 true，各组件据此跳过动画、直接显示最终状态。
 */
export function useInView(ref: RefObject<Element | null>, { threshold = 0.3, rootMargin = "0px 0px -10% 0px" } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);
  return inView;
}

/** 元素当前是否在窗口里（会反复变化），用来在看不见时暂停循环动画。 */
export function useVisible(ref: RefObject<Element | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
