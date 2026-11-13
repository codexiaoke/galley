"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Frame, View } from "@/core/algo/types";
import { prefersReducedMotion, useInView, useVisible } from "../in-view";
import { AlgoView } from "./views";

/**
 * 算法比赛：几种算法用同一组输入，并排同时播放。每走一步，各自前进一帧；
 * 先走完的停下，标出用了多少步。每一边实时显示比较了几次、交换了几次。
 *
 * "比较"和"交换"按每一帧画面上有没有对应的状态来数：画面上标出了比较，就算比较了一次。
 */

type Lane = { label: string; variants: { name: string; frames: Frame[] }[] };

const DELAY: Record<string, number> = { array: 420, grid: 160, graph: 700, tree: 500, table: 260, list: 700, heap: 420 };
const SPEEDS = [0.5, 1, 2, 4];

const has = (view: View, tone: string) => {
  if (view.kind === "array" || view.kind === "heap") return view.tones.includes(tone as never);
  if (view.kind === "table") return Object.values(view.tones).includes(tone as never);
  if (view.kind === "graph") return view.nodes.some((n) => n.tone === tone) || view.edges.some((e) => e.tone === tone);
  return false;
};

/** 每一帧时累计的比较次数和交换次数 */
function counts(frames: Frame[]) {
  let c = 0;
  let s = 0;
  return frames.map((f) => {
    if (has(f.view, "compare")) c++;
    if (has(f.view, "swap")) s++;
    return { compare: c, swap: s };
  });
}

export function RacePlayer({ title, lanes }: { title?: string; lanes: Lane[] }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { threshold: 0.4 });
  const visible = useVisible(ref);
  const [variant, setVariant] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const started = useRef(false);

  const presetNames = lanes[0].variants.map((v) => v.name);
  const runs = useMemo(
    () => lanes.map((lane) => {
      const frames = lane.variants[Math.min(variant, lane.variants.length - 1)].frames;
      return { label: lane.label, frames, counts: counts(frames) };
    }),
    [lanes, variant],
  );
  const longest = Math.max(...runs.map((r) => r.frames.length)) - 1;
  const fastest = Math.min(...runs.map((r) => r.frames.length));
  const kind = runs[0].frames[0].view.kind;

  useEffect(() => {
    if (!inView || started.current || prefersReducedMotion()) return;
    started.current = true;
    const t = setTimeout(() => setPlaying(true), 500);
    return () => clearTimeout(t);
  }, [inView]);

  useEffect(() => {
    if (!playing || !visible) return;
    if (index >= longest) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIndex((i) => Math.min(longest, i + 1)), (DELAY[kind] ?? 400) / speed);
    return () => clearTimeout(t);
  }, [playing, visible, index, longest, speed, kind]);

  const go = (i: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(longest, i)));
  };
  const toggle = () => {
    if (index >= longest) {
      setIndex(0);
      setPlaying(true);
    } else setPlaying((p) => !p);
  };

  return (
    <figure ref={ref} className="galley-algo galley-race" aria-label={`${runs.map((r) => r.label).join("、")}的比较`} style={{ "--lanes": runs.length } as CSSProperties}>
      <header className="galley-algo-head">
        <span className="galley-algo-label">{runs.map((r) => r.label).join(" vs ")}</span>
        {title && <span className="galley-algo-title">{title}</span>}
        {presetNames.length > 1 && (
          <span className="galley-algo-presets" role="group" aria-label="换一组输入">
            {presetNames.map((name, i) => (
              <button
                key={name}
                type="button"
                aria-pressed={i === variant}
                onClick={() => {
                  setVariant(i);
                  setIndex(0);
                  setPlaying(!prefersReducedMotion());
                }}
              >
                {name}
              </button>
            ))}
          </span>
        )}
      </header>

      <div className="galley-race-lanes">
        {runs.map((run) => {
          const at = Math.min(index, run.frames.length - 1);
          const done = index >= run.frames.length - 1;
          const c = run.counts[at];
          return (
            <section key={run.label} className="galley-race-lane" data-done={done || undefined}>
              <div className="galley-race-head">
                <span className="galley-race-name">{run.label}</span>
                {done && (
                  <span className="galley-race-done" data-best={run.frames.length === fastest || undefined}>
                    {run.frames.length === fastest ? "最快 · " : ""}
                    {run.frames.length} 步完成
                  </span>
                )}
              </div>
              <div className="galley-race-stage">
                <AlgoView view={run.frames[at].view} />
              </div>
              <dl className="galley-race-stats">
                <div>
                  <dt>比较</dt>
                  <dd>{c.compare}</dd>
                </div>
                <div>
                  <dt>交换</dt>
                  <dd>{c.swap}</dd>
                </div>
                <div>
                  <dt>步数</dt>
                  <dd>{at + 1}</dd>
                </div>
              </dl>
            </section>
          );
        })}
      </div>

      <div className="galley-algo-controls">
        <button type="button" onClick={() => go(0)} aria-label="回到开头" title="回到开头">
          <Icon d="M3 3h1.8v10H3zM13 3 6 8l7 5z" />
        </button>
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="上一步">
          <Icon d="M11 3 5 8l6 5" stroke />
        </button>
        <button type="button" className="galley-algo-play" onClick={toggle} aria-label={playing ? "暂停" : index >= longest ? "重新播放" : "播放"}>
          {playing ? <Icon d="M5 3h2v10H5zM9 3h2v10H9z" /> : index >= longest ? <Icon d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" stroke /> : <Icon d="M5 3l8 5-8 5z" />}
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={index >= longest} aria-label="下一步">
          <Icon d="M5 3l6 5-6 5" stroke />
        </button>
        <input
          type="range"
          min={0}
          max={longest}
          value={index}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="进度"
          className="galley-algo-scrub"
          style={{ "--p": `${longest ? (index / longest) * 100 : 100}%` } as CSSProperties}
        />
        <span className="galley-algo-step">
          {index + 1} / {longest + 1}
        </span>
        <button type="button" className="galley-algo-speed" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])} aria-label={`速度 ${speed} 倍`}>
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
