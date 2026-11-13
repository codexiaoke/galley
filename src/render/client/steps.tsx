"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { parseLineRanges } from "../lines";

/**
 * 分步讲解：左边是步骤，右边是代码（窄屏上代码在上方并吸顶）。
 * 哪一步滚到窗口中间，哪一步就是当前步骤：它的说明变成正常颜色，代码里对应的几行高亮，
 * 其余行淡下去；代码太长时自动滚到这几行。点击某一步也能切换过去。
 *
 * 结构由服务端渲染好（.galley-steps-code 和 .galley-steps-list > li[data-lines]），
 * 这里只负责切换状态，脚本没加载时也能完整阅读。
 */
export function StepsController({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLLIElement>(".galley-steps-list > li")];
    const lines = [...root.querySelectorAll<HTMLElement>(".galley-steps-code .line[data-line]")];
    const scroller = root.querySelector<HTMLElement>(".galley-steps-code pre");
    if (items.length === 0) return;
    root.dataset.ready = "true";

    const activate = (index: number) => {
      items.forEach((item, i) => (item.dataset.active = i === index ? "true" : "false"));
      const focus = parseLineRanges(items[index]?.dataset.lines ?? "");
      let first: HTMLElement | undefined;
      for (const line of lines) {
        const on = focus.size === 0 || focus.has(Number(line.dataset.line));
        line.dataset.focus = on ? "true" : "false";
        if (on && focus.size > 0 && !first) first = line;
      }
      // 只在代码框内部滚动，不动页面。
      if (scroller && first) {
        const top = first.offsetTop - scroller.clientHeight * 0.25;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    };
    activate(0);

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).map((e) => items.indexOf(e.target as HTMLLIElement));
        if (hit.length) activate(Math.max(...hit));
      },
      // 窗口正中间的一条窄带：步骤经过这里就成为当前步骤。
      { rootMargin: "-45% 0px -50% 0px" },
    );
    items.forEach((item) => observer.observe(item));

    const onClick = (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest("li");
      const index = item ? items.indexOf(item as HTMLLIElement) : -1;
      if (index >= 0 && !(e.target as HTMLElement).closest("a")) activate(index);
    };
    root.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      root.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div ref={ref} className="galley-steps">
      {children}
    </div>
  );
}
