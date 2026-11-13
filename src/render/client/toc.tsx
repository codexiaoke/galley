"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "../toc";

/**
 * 文章目录。宽屏时固定在正文右侧，当前读到的小节高亮，左边一条朱红短线跟着移动；
 * 窄屏时在文章开头折叠成一行"目录"，点开再看。两种只显示一种，由样式表按宽度切换。
 */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = items.map((i) => document.getElementById(i.id)).filter((h): h is HTMLElement => !!h);
    if (headings.length === 0) return;
    // 当前小节：标题已经滚过窗口上方三分之一处的最后一个。
    const update = () => {
      const line = window.innerHeight * 0.33;
      let current: string | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= line) current = h.id;
        else break;
      }
      setActive(current ?? headings[0].id);
    };
    update();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  const list = (
    <ol>
      {items.map((item) => (
        <li key={item.id} data-depth={item.depth} data-active={item.id === active || undefined}>
          <a href={`#${item.id}`}>{item.text}</a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <aside className="galley-toc-side" aria-label="目录">
        <nav>
          <p className="galley-toc-title">目录</p>
          {list}
        </nav>
      </aside>
      <details className="galley-toc-inline">
        <summary>目录</summary>
        <nav aria-label="目录">{list}</nav>
      </details>
    </>
  );
}
