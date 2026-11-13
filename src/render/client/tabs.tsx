"use client";

import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 标签页：上面一排标签，下面一条朱红短线滑到当前标签下；切换时内容轻轻淡入。
 * 左右方向键可以在标签之间移动。
 */
export function Tabs({ labels, children }: { labels: string[]; children: ReactNode }) {
  const panels = Children.toArray(children).filter(isValidElement);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useIsoLayoutEffect(() => {
    const list = listRef.current;
    const tab = list?.children[active] as HTMLElement | undefined;
    if (!list || !tab) return;
    list.style.setProperty("--tab-x", `${tab.offsetLeft}px`);
    list.style.setProperty("--tab-w", `${tab.offsetWidth}px`);
  }, [active]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (active + (e.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length;
    setActive(next);
    (listRef.current?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="galley-tabs">
      <div ref={listRef} role="tablist" className="galley-tabs-list" onKeyDown={onKey}>
        {panels.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
          >
            {labels[i] || `第 ${i + 1} 页`}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
          className="galley-tabs-panel"
        >
          {panel}
        </div>
      ))}
    </div>
  );
}
