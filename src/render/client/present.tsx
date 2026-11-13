"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * 演示模式：文章变成全屏的幻灯片。
 *
 * 翻页的规则：按"下一步"时，先问当前这一页里的动画（代码演变、算法动画……）还要不要往下走
 * ——给它们发一个 "galley-step" 事件，哪个接了（preventDefault）就算这一步用掉了；
 * 都不接（动画已经播完了，或者这一页没有动画），才翻到下一页。"上一步"同理。
 *
 * 幻灯片按固定的设计尺寸排版（横屏 1600×900，竖屏 900×1600），整体缩放到窗口大小，
 * 所以在什么屏幕上看、录成什么分辨率的视频，排版都一样。内容太多放不下时整页缩小一点。
 *
 * auto 模式（导出视频用）：自动往下走，每一步停留的时间由动画告诉我们（事件里的 wait），
 * 没有动画的页按讲稿或页面文字的长短估一个时间；讲稿作为字幕显示在下面。
 * 全部放完时在 window.__galleyPresentDone 上做个标记，录制脚本据此结束录制。
 */

export type PresentSlide = { title?: string; notes: string; text: number; content: ReactNode };
export type Cover = { title: string; summary?: string; site: string; date?: string; url?: string };

type StepDetail = { dir: number; wait?: number; caption?: string };

const DESIGN = { landscape: { w: 1600, h: 900 }, portrait: { w: 900, h: 1600 } };

export function Presentation({
  cover,
  slides,
  backHref,
  auto = false,
  orientation = "landscape",
  captions = false,
  durations,
}: {
  cover: Cover;
  slides: PresentSlide[];
  backHref: string;
  auto?: boolean;
  orientation?: "landscape" | "portrait";
  captions?: boolean;
  /** 导出视频时，录制脚本按朗读的长度给出每一页至少停留多久（毫秒） */
  durations?: number[];
}) {
  // 第 0 页是封面，最后一页是结尾
  const total = slides.length + 2;
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(1);
  const [chrome, setChrome] = useState(!auto);
  const [showNotes, setShowNotes] = useState(false);
  // 字幕：这一页有讲稿时用讲稿，没有时用页里动画当前这一步的说明
  const [stepCaption, setStepCaption] = useState<{ page: number; text: string } | null>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const size = DESIGN[orientation];

  // 缩放到窗口大小
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / size.w, window.innerHeight / size.h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [size.w, size.h]);

  // 内容放不下时整页缩小
  useLayoutEffect(() => {
    const el = slideRefs.current[page]?.querySelector<HTMLElement>(".galley-slide-body");
    if (!el) return;
    el.style.setProperty("--fit", "1");
    const ratio = el.clientHeight / el.scrollHeight;
    if (ratio < 1) el.style.setProperty("--fit", String(Math.max(0.55, ratio * 0.98)));
  }, [page]);

  /** 让当前页里的动画走一步；返回它接没接，以及建议等多久再走下一步 */
  const stepInside = useCallback((dir: number): StepDetail | null => {
    const slide = slideRefs.current[page];
    if (!slide) return null;
    const targets = [...slide.querySelectorAll<HTMLElement>("[data-steppable]")];
    for (const t of dir > 0 ? targets : targets.reverse()) {
      const detail: StepDetail = { dir };
      const ev = new CustomEvent<StepDetail>("galley-step", { detail, cancelable: true });
      t.dispatchEvent(ev);
      if (ev.defaultPrevented) return detail;
    }
    return null;
  }, [page]);

  const move = useCallback(
    (dir: number) => {
      const inner = stepInside(dir);
      if (inner) return inner;
      setPage((p) => Math.max(0, Math.min(total - 1, p + dir)));
      return null;
    },
    [stepInside, total],
  );

  // 键盘
  useEffect(() => {
    if (auto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        move(1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Home") setPage(0);
      else if (e.key === "End") setPage(total - 1);
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      } else if (e.key === "n" || e.key === "N") setShowNotes((v) => !v);
      else if (e.key === "Escape" && !document.fullscreenElement) window.location.href = backHref;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auto, move, total, backHref]);

  // 控制条：鼠标不动两秒后隐藏
  useEffect(() => {
    if (auto) return;
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setChrome(true);
      clearTimeout(t);
      t = setTimeout(() => setChrome(false), 2200);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
    };
  }, [auto]);

  // 自动播放（导出视频）
  useEffect(() => {
    if (!auto) return;
    const w = window as unknown as { __galleyPresentDone?: boolean; __galleyPage?: number };
    w.__galleyPage = page;
    if (page >= total - 1) {
      const t = setTimeout(() => (w.__galleyPresentDone = true), 2500);
      return () => clearTimeout(t);
    }
    const slide = page >= 1 ? slides[page - 1] : null;
    // 这一页至少停留多久：录制脚本给的朗读时长，否则按讲稿或页面文字估
    const reading = durations?.[page] ?? (slide ? Math.min(14000, Math.max(3500, ((slide.notes.length || slide.text) * 1000) / 7)) : 3500);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const tick = () => {
      if (cancelled) return;
      const inner = stepInside(1);
      if (inner) {
        if (inner.caption) setStepCaption({ page, text: inner.caption });
        timer = setTimeout(tick, inner.wait ?? 600);
        return;
      }
      const left = reading - (Date.now() - started);
      if (left > 0) timer = setTimeout(tick, left);
      else setPage((p) => p + 1);
    };
    // 先让这一页显示出来、动画开始，再开始往下走
    timer = setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auto, page, total, slides, stepInside, durations]);

  const current = page >= 1 && page <= slides.length ? slides[page - 1] : null;
  const caption = current ? current.notes || (stepCaption?.page === page ? stepCaption.text : null) : null;

  return (
    <div className="galley-present" data-orientation={orientation} data-captions={captions || undefined} data-chrome={chrome || undefined} onClick={(e) => !auto && e.target === e.currentTarget && move(1)}>
      <div className="galley-present-stage" style={{ width: size.w, height: size.h, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties}>
        <section ref={(el) => void (slideRefs.current[0] = el)} className="galley-slide galley-slide-cover" data-current={page === 0 || undefined} hidden={page !== 0}>
          <p className="galley-slide-site">{cover.site}</p>
          <h1>{cover.title}</h1>
          {cover.summary && <p className="galley-slide-summary">{cover.summary}</p>}
          {cover.date && <p className="galley-slide-date">{cover.date}</p>}
        </section>
        {slides.map((s, i) => (
          <section
            key={i}
            ref={(el) => void (slideRefs.current[i + 1] = el)}
            className="galley-slide"
            data-current={page === i + 1 || undefined}
            hidden={page !== i + 1}
          >
            <div className="galley-slide-body galley-prose">{s.content}</div>
          </section>
        ))}
        <section ref={(el) => void (slideRefs.current[total - 1] = el)} className="galley-slide galley-slide-cover" data-current={page === total - 1 || undefined} hidden={page !== total - 1}>
          <h1>{cover.title}</h1>
          <p className="galley-slide-site">{cover.site}</p>
          {cover.url && <p className="galley-slide-date">{cover.url.replace(/^https?:\/\//, "")}</p>}
        </section>
        {captions && caption && <p key={caption} className="galley-present-caption">{caption}</p>}
      </div>

      {!auto && (
        <>
          <div className="galley-present-progress" aria-hidden="true">
            <i style={{ width: `${(page / (total - 1)) * 100}%` }} />
          </div>
          <nav className="galley-present-bar" aria-label="演示控制">
            <a href={backHref} aria-label="退出演示" title="退出（Esc）">
              ✕
            </a>
            <button type="button" onClick={() => move(-1)} aria-label="上一步" title="上一步（←）">
              ←
            </button>
            <span className="galley-present-count">
              {page + 1} / {total}
            </span>
            <button type="button" onClick={() => move(1)} aria-label="下一步" title="下一步（→ 或空格）">
              →
            </button>
            <button type="button" onClick={() => setShowNotes((v) => !v)} aria-pressed={showNotes} title="讲稿（N）">
              讲稿
            </button>
            <button
              type="button"
              onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.())}
              title="全屏（F）"
            >
              全屏
            </button>
          </nav>
          {showNotes && (
            <aside className="galley-present-notes">
              <strong>{page >= 1 && page <= slides.length ? (slides[page - 1].title ?? `第 ${page} 页`) : page === 0 ? "封面" : "结尾"}</strong>
              <p>{page >= 1 && page <= slides.length ? slides[page - 1].notes || "这一页没有讲稿。" : ""}</p>
            </aside>
          )}
        </>
      )}
    </div>
  );
}
