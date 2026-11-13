"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prefersReducedMotion } from "./in-view";

/**
 * 正文里单独成段的图片：下面是图注，点击放大。
 * 放大时图片从原来的位置平滑地移到屏幕中间（先算好起止两个位置，再用动画补间），
 * 点击任意处、按 Esc 或者滚动页面时缩回原位。
 */
export function ZoomImage({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <figure className="galley-image">
      <button type="button" className="galley-image-button" onClick={() => setOpen(true)} aria-label={`放大查看：${alt || "图片"}`}>
        {/* 媒体库的图片尺寸不固定，用普通的 img 标签 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt={alt} loading="lazy" decoding="async" style={{ visibility: open ? "hidden" : undefined }} />
      </button>
      {caption && <figcaption className="galley-image-caption">{caption}</figcaption>}
      {open && <Zoomed src={src} alt={alt} origin={imgRef} onClosed={() => setOpen(false)} />}
    </figure>
  );
}

const MARGIN = 24;

function Zoomed({
  src,
  alt,
  origin,
  onClosed,
}: {
  src: string;
  alt: string;
  origin: React.RefObject<HTMLImageElement | null>;
  onClosed: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  // 点击遮罩时调用；真正的实现在下面的 effect 里，挂载时设置一次。
  const closeRef = useRef<() => void>(() => onClosed());

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    let closing = false;

    /** 从原图的位置到放大后位置的变换 */
    const fromTransform = () => {
      const from = origin.current?.getBoundingClientRect();
      const to = img.getBoundingClientRect();
      if (!from || to.width === 0) return "none";
      const scale = from.width / to.width;
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      return `translate(${dx}px, ${dy}px) scale(${scale})`;
    };
    const size = () => {
      // 放大后的尺寸：不超过窗口（留出边距），也不超过图片本身尺寸的 1.6 倍。
      const nw = origin.current?.naturalWidth || img.naturalWidth || 1;
      const nh = origin.current?.naturalHeight || img.naturalHeight || 1;
      const scale = Math.min((window.innerWidth - MARGIN * 2) / nw, (window.innerHeight - MARGIN * 2) / nh, 1.6);
      img.style.width = `${nw * scale}px`;
      img.style.height = `${nh * scale}px`;
    };
    const close = () => {
      if (closing) return;
      closing = true;
      if (prefersReducedMotion()) return onClosed();
      const duration = 280;
      backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: "ease-out", fill: "forwards" });
      img
        .animate([{ transform: "none" }, { transform: fromTransform() }], { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" })
        .finished.then(onClosed, onClosed);
    };
    closeRef.current = close;

    size();
    if (!prefersReducedMotion()) {
      backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
      img.animate([{ transform: fromTransform() }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", size);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", size);
    };
    // 只在打开时运行一次；onClosed 每次渲染都是新函数，但行为不变。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="galley-zoom" onClick={() => closeRef.current()} role="dialog" aria-modal="true" aria-label={alt || "放大的图片"}>
      <div ref={backdropRef} className="galley-zoom-backdrop" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt={alt} className="galley-zoom-img" />
    </div>,
    document.body,
  );
}
