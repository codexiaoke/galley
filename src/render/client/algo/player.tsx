"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Frame, Tone } from "@/core/algo/types";
import { prefersReducedMotion, useInView, useVisible } from "../in-view";
import { AlgoView } from "./views";

/**
 * 算法动画的播放器：上面是画面，下面一句说明，再下面是控制条（重来、上一步、播放/暂停、下一步、
 * 进度条、速度），最下面是伪代码（当前行高亮）、变量和图例。
 *
 * 第一次滚到眼前时自动开始播放，滚出窗口时暂停；读者设置了减少动态效果时不自动播放。
 * 播放器获得焦点后，空格播放/暂停，左右方向键单步。
 */

/** 每种画面一帧停留多久（毫秒，1 倍速）。迷宫一帧变化小，走得快一些。 */
const BASE_DELAY: Record<string, number> = { array: 850, grid: 240, graph: 1100, tree: 850, table: 420, list: 1100 };
const SPEEDS = [0.5, 1, 2, 4];

export function AlgoPlayer({
  label,
  title,
  code,
  legend,
  variants,
}: {
  label: string;
  title?: string;
  /** 代码，一行一项；可以是高亮过的内容 */
  code: ReactNode[];
  legend: { tone: Tone; label: string }[];
  /** 一组或几组输入各自的动画；几组时读者可以切换 */
  variants: { name: string; frames: Frame[] }[];
}) {
  const [variant, setVariant] = useState(0);
  const frames = variants[Math.min(variant, variants.length - 1)].frames;
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { threshold: 0.45 });
  const visible = useVisible(ref);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const started = useRef(false);
  const codeRef = useRef<HTMLPreElement>(null);
  const last = frames.length - 1;
  const frame = frames[Math.min(index, last)];

  // 第一次进入视野时自动播放
  useEffect(() => {
    if (!inView || started.current || prefersReducedMotion()) return;
    started.current = true;
    // 在演示模式里由演示推进，不自己播放
    if (ref.current?.closest(".galley-present")) return;
    const t = setTimeout(() => setPlaying(true), 500);
    return () => clearTimeout(t);
  }, [inView]);

  // 播放：按速度一帧一帧往前走，到最后一帧停下
  useEffect(() => {
    if (!playing || !visible) return;
    if (index >= last) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const delay = (BASE_DELAY[frame.view.kind] ?? 800) / speed;
    const t = setTimeout(() => setIndex((i) => Math.min(last, i + 1)), delay);
    return () => clearTimeout(t);
  }, [playing, visible, index, last, speed, frame.view.kind]);

  // 代码比较长时，代码区自己滚动，让当前行保持在可见范围里（不动整个页面）。
  useEffect(() => {
    const pre = codeRef.current;
    const line = pre?.querySelector<HTMLElement>("[data-current]");
    if (!pre || !line) return;
    const top = line.offsetTop - pre.offsetTop;
    if (top < pre.scrollTop + 8 || top > pre.scrollTop + pre.clientHeight - 32) {
      pre.scrollTo({ top: Math.max(0, top - pre.clientHeight / 3), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [frame.line]);

  // 演示模式的"下一步"：没播完时开始播放（播放中继续等），播完了交给演示翻页；"上一步"回到开头
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onStep = (e: Event) => {
      const detail = (e as CustomEvent<{ dir: number; wait?: number; caption?: string }>).detail;
      if (detail.dir > 0) {
        if (index >= last) return;
        e.preventDefault();
        if (!playing) setPlaying(true);
        detail.wait = 700;
        detail.caption = frame.note;
      } else {
        if (index === 0) return;
        e.preventDefault();
        setPlaying(false);
        setIndex(0);
      }
    };
    el.addEventListener("galley-step", onStep);
    return () => el.removeEventListener("galley-step", onStep);
  }, [index, last, playing, frame.note]);

  const go = (i: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, i)));
  };
  const toggle = () => {
    if (index >= last) {
      setIndex(0);
      setPlaying(true);
    } else setPlaying((p) => !p);
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    }
  };

  const atEnd = index >= last;
  return (
    <figure ref={ref} className="galley-algo" tabIndex={0} onKeyDown={onKey} aria-label={`${label}演示`} data-kind={frame.view.kind} data-steppable>
      <header className="galley-algo-head">
        <span className="galley-algo-label">{label}</span>
        {title && <span className="galley-algo-title">{title}</span>}
        {variants.length > 1 && (
          <span className="galley-algo-presets" role="group" aria-label="换一组输入">
            {variants.map((v, i) => (
              <button
                key={v.name}
                type="button"
                aria-pressed={i === variant}
                onClick={() => {
                  setVariant(i);
                  setIndex(0);
                  setPlaying(!prefersReducedMotion());
                }}
              >
                {v.name}
              </button>
            ))}
          </span>
        )}
      </header>

      <div className="galley-algo-stage">
        <AlgoView view={frame.view} />
        {frame.extra?.map((view, i) => (
          <div key={i} className="galley-algo-extra">
            <AlgoView view={view} />
          </div>
        ))}
      </div>

      <p className="galley-algo-note" aria-live="polite">
        {frame.note}
      </p>

      <div className="galley-algo-controls">
        <button type="button" onClick={() => go(0)} aria-label="回到开头" title="回到开头">
          <Icon d="M3 3h1.8v10H3zM13 3 6 8l7 5z" />
        </button>
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="上一步" title="上一步（←）">
          <Icon d="M11 3 5 8l6 5" stroke />
        </button>
        <button type="button" className="galley-algo-play" onClick={toggle} aria-label={playing ? "暂停" : atEnd ? "重新播放" : "播放"} title="播放 / 暂停（空格）">
          {playing ? <Icon d="M5 3h2v10H5zM9 3h2v10H9z" /> : atEnd ? <Icon d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" stroke /> : <Icon d="M5 3l8 5-8 5z" />}
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={atEnd} aria-label="下一步" title="下一步（→）">
          <Icon d="M5 3l6 5-6 5" stroke />
        </button>
        <input
          type="range"
          min={0}
          max={last}
          value={index}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="进度"
          className="galley-algo-scrub"
          style={{ "--p": `${last ? (index / last) * 100 : 100}%` } as React.CSSProperties}
        />
        <span className="galley-algo-step">
          {index + 1} / {frames.length}
        </span>
        <button
          type="button"
          className="galley-algo-speed"
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
          aria-label={`速度 ${speed} 倍，点击切换`}
          title="切换速度"
        >
          {speed}×
        </button>
      </div>

      <div className="galley-algo-detail">
        <pre ref={codeRef} className="galley-algo-code" aria-label="代码">
          {code.map((line, i) => (
            <span key={i} data-current={frame.line === i || undefined}>
              {line}
            </span>
          ))}
        </pre>
        <div className="galley-algo-side">
          {frame.vars && frame.vars.length > 0 && (
            <dl className="galley-algo-vars">
              {frame.vars.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <ul className="galley-algo-legend">
            {legend.map((l) => (
              <li key={l.tone}>
                <i data-tone={l.tone} />
                {l.label}
              </li>
            ))}
          </ul>
        </div>
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
