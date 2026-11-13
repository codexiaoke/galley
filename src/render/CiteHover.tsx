"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 依据文字和它的悬浮卡片。
 *
 * 一句话换行后在页面上是好几个矩形，用纯样式定位的浮层只能对齐其中一个，
 * 所以这里用脚本定位：卡片出现在整句话的正下方、鼠标所在的水平位置附近，
 * 并且始终留在窗口之内；下方放不下时改到上方。卡片不会盖住这句话本身。
 *
 * 两个容易出错的地方：
 * 1. 卡片必须直接挂在 body 下面。它的位置是相对窗口算的，而正文的任何一层容器
 *    只要带有位移动画，就会变成它的定位基准，算出来的位置就全错了。
 * 2. 卡片和句子之间有一小段空隙。鼠标从句子移向卡片时会经过这段空隙，
 *    卡片在空隙上铺了一层看不见的"桥"（见样式表），鼠标经过时不算离开。
 */

type Anchor = {
  /** 水平方向的参考点：鼠标的位置，键盘聚焦时是这句话的起点 */
  x: number;
  /** 整句话第一行的顶部和最后一行的底部 */
  top: number;
  bottom: number;
};

const EDGE = 12; // 卡片离窗口边缘的最小距离
const GAP = 8; // 卡片离文字的距离
const CLOSE_DELAY = 280; // 留出时间让鼠标从文字移到卡片上

export function CiteHover({
  marked = false,
  card,
  className = "galley-cite",
  children,
}: {
  /** 文字的样式：依据是 galley-cite，术语是 galley-term */
  className?: string;
  /** 审阅预览里用来标出依据已过期的句子；前台阅读时始终为 false */
  marked?: boolean;
  card: ReactNode;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerType = useRef("mouse");
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const cardId = useId();

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setAnchor(null);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(close, CLOSE_DELAY);
  }, [cancelClose, close]);

  const openAt = useCallback(
    (clientX?: number) => {
      const rects = Array.from(anchorRef.current?.getClientRects() ?? []);
      if (rects.length === 0) return;
      cancelClose();
      setAnchor({
        x: clientX ?? rects[0].left,
        top: rects[0].top,
        bottom: rects[rects.length - 1].bottom,
      });
    },
    [cancelClose],
  );

  /** 卡片挂载后量出它的大小，再决定放在哪里。 */
  const placeCard = (node: HTMLSpanElement | null) => {
    cardRef.current = node;
    if (!node || !anchor) return;
    const { width, height } = node.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    // 水平方向优先留在正文栏之内，和文字的左右边缘对齐；正文栏比卡片还窄时退回到窗口范围。
    const column = anchorRef.current?.closest(".galley-prose")?.getBoundingClientRect();
    let minLeft = EDGE;
    let maxRight = viewportWidth - EDGE;
    if (column && Math.min(column.right, maxRight) - Math.max(column.left, minLeft) >= width) {
      minLeft = Math.max(column.left, minLeft);
      maxRight = Math.min(column.right, maxRight);
    }
    const left = Math.max(minLeft, Math.min(anchor.x - 24, maxRight - width));
    const below = anchor.bottom + GAP;
    const above = anchor.top - GAP - height;
    const placeAbove = below + height > viewportHeight - EDGE && above > EDGE;
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(placeAbove ? above : below)}px`;
    node.dataset.side = placeAbove ? "above" : "below";
    node.dataset.ready = "true";
  };

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!anchorRef.current?.contains(target) && !cardRef.current?.contains(target)) close();
    };
    // 卡片的位置是相对窗口算的，页面滚动或窗口变化后就不准了，直接收起。
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchor, close]);

  useEffect(() => cancelClose, [cancelClose]);

  return (
    <>
      <span
        ref={anchorRef}
        tabIndex={0}
        aria-describedby={anchor ? cardId : undefined}
        className={marked ? `${className} galley-cite-stale` : className}
        onPointerDown={(e) => {
          pointerType.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") openAt(e.clientX);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleClose();
        }}
        onFocus={() => {
          // 触屏上聚焦由点击触发，交给下面的 onClick 处理，避免先开后关。
          if (pointerType.current === "mouse") openAt();
        }}
        onBlur={scheduleClose}
        onClick={(e) => {
          // 触屏没有悬停：点一下打开，再点一下收起。
          if (pointerType.current === "mouse") return;
          if (anchor) close();
          else openAt(e.clientX);
        }}
      >
        {children}
      </span>
      {anchor &&
        createPortal(
          <span
            ref={placeCard}
            id={cardId}
            role="tooltip"
            className="galley-cite-card"
            onPointerEnter={cancelClose}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") scheduleClose();
            }}
          >
            {card}
          </span>,
          document.body,
        )}
    </>
  );
}
