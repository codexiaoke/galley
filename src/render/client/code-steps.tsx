"use client";

import { Children, isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { prefersReducedMotion, useInView, useVisible } from "./in-view";
import { SPEEDS, usePresentSpeed } from "./speed";

/**
 * 代码一步一步演变的播放器。
 *
 * 每一行带着一个身份（见 render/code-diff.ts）。切到另一步时：
 * - 两步都有的行：从原来的位置平滑地挪到新位置；
 * - 新出现的行：从右边淡入；
 * - 消失的行：留在原来的位置淡出，然后消失。
 * 这一步改动的行（或者作者指定的行）高亮，其余的稍微淡一点。
 *
 * 第一次滚到眼前时自动播放，每一步停留的时间按讲解的长短来定；
 * 演示模式里由方向键一步一步推进（见 "galley-step" 事件）。
 */

export type CodeStep = {
  lines: { key: string; node: ReactNode }[];
  /** 高亮的行（从 0 开始） */
  focus: number[];
  file?: string;
  /** 这一步停留多久（毫秒，1 倍速） */
  duration: number;
};

export function CodeStepsPlayer({
  title,
  lang,
  steps,
  texts = [],
  children,
}: {
  title?: string;
  lang?: string;
  steps: CodeStep[];
  /** 每一步讲解的纯文字：导出视频时当字幕 */
  texts?: string[];
  children: ReactNode;
}) {
  const notes = Children.toArray(children).filter(isValidElement);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { threshold: 0.45 });
  const visible = useVisible(ref);
  const [index, setIndex] = useState(0);
  const [from, setFrom] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // 在演示里时，再乘上演示的整体速度
  const presentSpeed = usePresentSpeed();
  const rate = speed * presentSpeed;
  const started = useRef(false);
  const last = steps.length - 1;
  const step = steps[index];
  const maxLines = Math.max(...steps.map((s) => s.lines.length));

  const go = (i: number, keepPlaying = false) => {
    const next = Math.max(0, Math.min(last, i));
    if (next === index) return;
    setFrom(index);
    setIndex(next);
    if (!keepPlaying) setPlaying(false);
  };

  useEffect(() => {
    if (!inView || started.current || prefersReducedMotion()) return;
    started.current = true;
    // 在演示模式里由演示一步一步推进，不自己播放
    if (ref.current?.closest(".galley-present")) return;
    const t = setTimeout(() => setPlaying(true), 600);
    return () => clearTimeout(t);
  }, [inView]);

  useEffect(() => {
    if (!playing || !visible) return;
    if (index >= last) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setFrom(index);
      setIndex(index + 1);
    }, step.duration / rate);
    return () => clearTimeout(t);
  }, [playing, visible, index, last, step.duration, rate]);

  // 演示模式按方向键时发来的"走一步"：能走就走，并告诉演示模式这一下已经用掉了。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onStep = (e: Event) => {
      const detail = (e as CustomEvent<{ dir: number; wait?: number; caption?: string }>).detail;
      const next = index + detail.dir;
      if (next < 0 || next > last) return;
      e.preventDefault();
      detail.wait = steps[next].duration / rate;
      detail.caption = texts[next];
      setPlaying(false);
      setFrom(index);
      setIndex(next);
    };
    el.addEventListener("galley-step", onStep);
    return () => el.removeEventListener("galley-step", onStep);
  }, [index, last, steps, texts, rate]);

  const current = new Set(step.lines.map((l) => l.key));
  const before = from === null ? null : steps[from];
  const beforeKeys = new Set(before?.lines.map((l) => l.key) ?? []);
  const leaving = before ? before.lines.map((l, i) => ({ ...l, i })).filter((l) => !current.has(l.key)) : [];
  const focus = new Set(step.focus);

  return (
    <figure
      ref={ref}
      className="galley-codesteps"
      tabIndex={0}
      data-steppable
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(index + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(index - 1);
        } else if (e.key === " ") {
          e.preventDefault();
          if (index >= last) {
            setFrom(index);
            setIndex(0);
            setPlaying(true);
          } else setPlaying((p) => !p);
        }
      }}
    >
      <header className="galley-codesteps-head">
        <span className="galley-codesteps-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="galley-codesteps-file">{step.file ?? title ?? lang ?? ""}</span>
        <span className="galley-codesteps-count">
          {index + 1} / {steps.length}
        </span>
      </header>
      <div className="galley-codesteps-code" style={{ "--rows": maxLines } as CSSProperties} data-focused={focus.size > 0 || undefined}>
        <pre>
          <code>
            {leaving.map((l) => (
              <span key={`out-${l.key}-${from}`} className="galley-codesteps-line" data-leaving style={{ "--i": l.i } as CSSProperties}>
                {l.node}
              </span>
            ))}
            {step.lines.map((l, i) => (
              <span
                key={l.key}
                className="galley-codesteps-line"
                data-entering={before && !beforeKeys.has(l.key) ? true : undefined}
                data-focus={focus.has(i) || undefined}
                style={{ "--i": i } as CSSProperties}
              >
                {l.node}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <div className="galley-codesteps-note" aria-live="polite">
        <div key={index} className="galley-codesteps-note-inner">
          {notes[index]}
        </div>
      </div>
      <div className="galley-codesteps-controls">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="上一步">
          <Icon d="M11 3 5 8l6 5" stroke />
        </button>
        <button
          type="button"
          className="galley-algo-play"
          onClick={() => {
            if (index >= last) {
              setFrom(index);
              setIndex(0);
              setPlaying(true);
            } else setPlaying((p) => !p);
          }}
          aria-label={playing ? "暂停" : index >= last ? "重新播放" : "播放"}
        >
          {playing ? <Icon d="M5 3h2v10H5zM9 3h2v10H9z" /> : index >= last ? <Icon d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" stroke /> : <Icon d="M5 3l8 5-8 5z" />}
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={index >= last} aria-label="下一步">
          <Icon d="M5 3l6 5-6 5" stroke />
        </button>
        <span className="galley-codesteps-progress" aria-hidden="true">
          {steps.map((_, i) => (
            <button key={i} type="button" tabIndex={-1} data-on={i <= index || undefined} onClick={() => go(i)} aria-label={`第 ${i + 1} 步`} />
          ))}
        </span>
        <button
          type="button"
          className="galley-codesteps-speed"
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
          aria-label={`速度 ${speed} 倍，点击切换`}
          title="切换速度"
        >
          {speed}×
        </button>
      </div>
    </figure>
  );
}

function Icon({ d, stroke = false }: { d: string; stroke?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d={d} fill={stroke ? "none" : "currentColor"} stroke={stroke ? "currentColor" : "none"} strokeWidth={stroke ? 1.6 : 0} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
