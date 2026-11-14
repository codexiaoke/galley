"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { isBlend, readingTime, sceneFrame, type FrameValue, type NodeFrame, type SceneFrame } from "@/core/scene/frame";
import type { Scene, SceneNode } from "@/core/scene/types";
import { arrowHead, curveDirection, curvePath, curvePoint, linkCurve, type Curve, type End } from "../scene-geometry";
import { prefersReducedMotion, useInView, useVisible } from "./in-view";
import { SPEEDS, usePresentSpeed } from "./speed";

/**
 * 场景动画的播放器。
 *
 * 画面是一张 SVG，每一帧按"第几步、这一步放到第几毫秒"现算出来（core/scene/frame.ts），
 * 所以正着放、退回上一步、直接跳到某一步，用的是同一套计算。
 *
 * 三种用法，一份数据：
 * - 文章里：第一次滚到眼前时自动播放，每一步的动画放完后停一会儿（按那句文字的字数），再走下一步；
 * - 演示里：由方向键一步一步推进（"galley-step" 事件），这一步的讲稿交给演示当字幕和提词；
 * - 打印、存成 PDF：直接显示最后的样子。
 *
 * 颜色都是主题变量的名字，画的时候才换成 var(--…)，所以换主题、换深色模式不用重新算。
 */

/** 作者写的颜色名字对应的主题变量。清单见 core/scene/types.ts 的 SCENE_COLORS */
const COLOR_VARS = new Map<string, string>([
  ["ink", "var(--ink)"],
  ["soft", "var(--ink-soft)"],
  ["faint", "var(--ink-faint)"],
  ["accent", "var(--accent)"],
  ["paper", "var(--paper)"],
  ["raised", "var(--paper-raised)"],
  ["sunken", "var(--paper-sunken)"],
  ["rule", "var(--rule)"],
  ["code", "var(--code-bg)"],
  ["c1", "var(--chart-1)"],
  ["c2", "var(--chart-2)"],
  ["c3", "var(--chart-3)"],
  ["c4", "var(--chart-4)"],
  ["c5", "var(--chart-5)"],
  ["none", "transparent"],
]);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** "accent/15" 这样的名字换成 CSS 颜色。不认识的名字一律按正文色画，不把作者给的字符串直接放进样式里 */
function cssColor(token: string): string {
  const [name, alpha] = token.split("/");
  const base = COLOR_VARS.get(name) ?? "var(--ink)";
  const a = Number(alpha);
  return alpha !== undefined && Number.isFinite(a) ? `color-mix(in srgb, ${base} ${Math.round(clamp01(a / 100) * 100)}%, transparent)` : base;
}

function paint(v: FrameValue | undefined, fallback: string): string {
  if (typeof v !== "string" && !isBlend(v)) return cssColor(fallback);
  if (isBlend(v)) return `color-mix(in srgb, ${cssColor(v.b)} ${Math.round(clamp01(v.p) * 100)}%, ${cssColor(v.a)})`;
  return cssColor(v);
}

const num = (v: FrameValue | undefined, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** 文字的过渡：换字时旧的淡出、新的淡入；打字时新的一个字一个字出现 */
function words(v: FrameValue | undefined): { text: string; alpha: number } {
  if (v === undefined) return { text: "", alpha: 1 };
  if (!isBlend(v)) return { text: String(v), alpha: 1 };
  if (v.type) return { text: Array.from(v.b).slice(0, Math.round(clamp01(v.p) * Array.from(v.b).length)).join(""), alpha: 1 };
  return v.p < 0.5 ? { text: v.a, alpha: 1 - v.p * 2 } : { text: v.b, alpha: v.p * 2 - 1 };
}

/** 不能平滑过渡的值（比如标出哪几行）：过了一半就换 */
const pick = (v: FrameValue | undefined) => (v === undefined ? "" : isBlend(v) ? (v.p < 0.5 ? v.a : v.b) : String(v));

const MONO = { "data-mono": true } as const;

/** 东西在画面上占的位置，连线靠它找到边缘 */
function endOf(node: SceneNode, f: NodeFrame): End {
  const cx = num(f.x, 0) + num(f.ox, 0);
  const cy = num(f.y, 0) + num(f.oy, 0);
  const scale = num(f.scale, 1);
  if (node.kind === "circle") return { cx, cy, hw: num(f.r, 0) * scale, hh: num(f.r, 0) * scale, round: true };
  if (node.kind === "text") {
    // 文字按它的对齐方式占位：靠左对齐时 x 是左边缘
    const w = num(f.w, 0) * scale;
    const align = pick(f.align);
    return { cx: align === "start" ? cx + w / 2 : align === "end" ? cx - w / 2 : cx, cy, hw: w / 2 + 4, hh: (num(f.h, 0) * scale) / 2 };
  }
  return { cx, cy, hw: (num(f.w, 0) * scale) / 2, hh: (num(f.h, 0) * scale) / 2 };
}

function curveOf(link: SceneNode, byId: Map<string, SceneNode>, frame: SceneFrame): Curve | null {
  const end = (v: SceneNode["from"]): End | null => {
    if (Array.isArray(v)) return { cx: v[0], cy: v[1], hw: 0, hh: 0 };
    const node = v ? byId.get(v) : undefined;
    return node && frame[node.id] ? endOf(node, frame[node.id]) : null;
  };
  const a = end(link.from);
  const b = end(link.to);
  return a && b ? linkCurve(a, b, num(frame[link.id]?.bend, 0)) : null;
}

/**
 * 线上的字放在线的哪一侧（单位向量），以及字怎么对齐：
 * 弯的时候放在弯出去的那一侧，直的时候放在上方；竖着的线放在右边，字从线旁边开始排。
 */
function labelSide(curve: Curve, bend: number, t: number): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  const dir = curveDirection(curve, t);
  const nx = -dir.y;
  const ny = dir.x;
  const sign = bend !== 0 ? Math.sign(bend) : ny > 0.01 ? -1 : ny < -0.01 ? 1 : nx > 0 ? 1 : -1;
  const x = nx * sign;
  return { x, y: ny * sign, anchor: Math.abs(dir.y) > 0.8 ? (x > 0 ? "start" : "end") : "middle" };
}

const LAYER: Record<string, number> = { frame: 0, link: 1, box: 2, circle: 2, text: 2, code: 2, packet: 3 };

function SceneSvg({ scene, frame, label }: { scene: Scene; frame: SceneFrame; label: string }) {
  const byId = useMemo(() => new Map(scene.nodes.map((n) => [n.id, n])), [scene]);
  const ordered = useMemo(() => scene.nodes.filter((n) => n.kind !== "camera").sort((a, b) => (LAYER[a.kind] ?? 2) - (LAYER[b.kind] ?? 2)), [scene]);
  const cameraNode = scene.nodes.find((n) => n.kind === "camera");
  const cam = cameraNode ? frame[cameraNode.id] : undefined;
  const zoom = Math.min(8, Math.max(0.2, num(cam?.zoom, 1)));
  const view = `translate(${scene.w / 2} ${scene.h / 2}) scale(${zoom}) translate(${-num(cam?.x, scene.w / 2)} ${-num(cam?.y, scene.h / 2)})`;

  const draw = (node: SceneNode): ReactNode => {
    const f = frame[node.id];
    if (!f) return null;
    const opacity = clamp01(num(f.opacity, 0));
    if (opacity <= 0.001) return null;

    if (node.kind === "link") {
      const curve = curveOf(node, byId, frame);
      const t = clamp01(num(f.draw, 0));
      if (!curve || t <= 0.001) return null;
      const stroke = paint(f.stroke, "soft");
      const width = Math.max(0.5, num(f.width, 1.6));
      const head = pick(f.head);
      const size = 6 + width * 2;
      // 箭头随着线画出来一起长大
      const grow = clamp01(t * 5);
      const tag = words(f.text);
      const mid = curvePoint(curve, 0.5);
      const side = labelSide(curve, num(f.bend, 0), 0.5);
      return (
        <g key={node.id} opacity={opacity}>
          <path d={curvePath(curve, t)} fill="none" style={{ stroke }} strokeWidth={width} strokeLinecap="round" strokeDasharray={num(f.dashed, 0) ? "5 5" : undefined} />
          {head !== "none" && <path d={arrowHead(curvePoint(curve, t), curveDirection(curve, t), size * grow)} style={{ fill: stroke }} />}
          {head === "both" && <path d={arrowHead(curve.p0, { x: -curveDirection(curve, 0).x, y: -curveDirection(curve, 0).y }, size * grow)} style={{ fill: stroke }} />}
          {tag.text && (
            <text
              className="galley-scene-halo"
              x={mid.x + side.x * 12}
              y={mid.y + side.y * 12}
              fontSize={num(f.size, 12)}
              textAnchor={side.anchor}
              dominantBaseline="central"
              style={{ fill: paint(f.color, "soft") }}
              opacity={clamp01((t - 0.55) / 0.45) * tag.alpha}
            >
              {tag.text}
            </text>
          )}
        </g>
      );
    }

    if (node.kind === "packet") {
      const link = node.along ? byId.get(node.along) : undefined;
      const curve = link ? curveOf(link, byId, frame) : null;
      if (!curve) return null;
      const pos = clamp01(num(f.pos, 0));
      const at = curvePoint(curve, pos);
      const r = Math.max(1, num(f.r, 5));
      const tag = words(f.text);
      // 小圆点带的字放在线的另一侧，不和线上的字叠在一起
      const side = labelSide(curve, num(frame[link!.id]?.bend, 0), pos);
      const flip = side.anchor === "middle" ? "middle" : side.anchor === "start" ? "end" : "start";
      return (
        <g key={node.id} opacity={opacity} transform={`translate(${at.x} ${at.y})`}>
          <circle r={r + 4} style={{ fill: paint(f.fill, "accent") }} opacity={0.18} />
          <circle r={r} style={{ fill: paint(f.fill, "accent") }} />
          {tag.text && (
            <text className="galley-scene-halo" x={-side.x * (r + 10)} y={-side.y * (r + 10)} fontSize={num(f.size, 11)} textAnchor={flip} dominantBaseline="central" style={{ fill: paint(f.color, "ink") }} {...MONO}>
              {tag.text}
            </text>
          )}
        </g>
      );
    }

    const x = num(f.x, 0) + num(f.ox, 0);
    const y = num(f.y, 0) + num(f.oy, 0);
    const transform = `translate(${x} ${y}) rotate(${num(f.rotate, 0)}) scale(${num(f.scale, 1)})`;
    const size = Math.max(4, num(f.size, 15));
    const color = paint(f.color, "ink");
    const tag = words(f.text);
    const dash = num(f.dashed, 0) ? "5 4" : undefined;

    if (node.kind === "box" || node.kind === "frame") {
      const w = Math.max(0, num(f.w, 0));
      const h = Math.max(0, num(f.h, 0));
      const sub = words(f.sub);
      return (
        <g key={node.id} transform={transform} opacity={opacity}>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.max(0, num(f.radius, 10))} style={{ fill: paint(f.fill, node.kind === "box" ? "raised" : "none"), stroke: paint(f.stroke, "ink") }} strokeWidth={node.kind === "box" ? 1.6 : 1.2} strokeDasharray={dash} />
          {node.kind === "frame" ? (
            <text x={-w / 2 + 13} y={-h / 2 + 15} fontSize={size} dominantBaseline="central" style={{ fill: color }} opacity={tag.alpha} letterSpacing="0.04em">
              {tag.text}
            </text>
          ) : (
            <>
              <text y={sub.text ? -size * 0.5 : 0} fontSize={size} fontWeight={500} textAnchor="middle" dominantBaseline="central" style={{ fill: color }} opacity={tag.alpha}>
                {tag.text}
              </text>
              {sub.text && (
                <text y={size * 0.72} fontSize={size * 0.78} textAnchor="middle" dominantBaseline="central" style={{ fill: color }} opacity={0.62 * sub.alpha}>
                  {sub.text}
                </text>
              )}
            </>
          )}
        </g>
      );
    }

    if (node.kind === "circle") {
      return (
        <g key={node.id} transform={transform} opacity={opacity}>
          <circle r={Math.max(0, num(f.r, 24))} style={{ fill: paint(f.fill, "raised"), stroke: paint(f.stroke, "ink") }} strokeWidth={1.6} strokeDasharray={dash} />
          <text fontSize={size} fontWeight={500} textAnchor="middle" dominantBaseline="central" style={{ fill: color }} opacity={tag.alpha}>
            {tag.text}
          </text>
        </g>
      );
    }

    if (node.kind === "text") {
      const lines = tag.text.split("\n");
      const lh = size * 1.5;
      const align = pick(f.align);
      return (
        <g key={node.id} transform={transform} opacity={opacity * tag.alpha}>
          {lines.map((line, i) => (
            <text
              key={i}
              y={(i - (lines.length - 1) / 2) * lh}
              fontSize={size}
              fontWeight={num(f.bold, 0) ? 600 : 400}
              textAnchor={align === "start" ? "start" : align === "end" ? "end" : "middle"}
              dominantBaseline="central"
              style={{ fill: color, whiteSpace: "pre" }}
              {...(num(f.mono, 0) ? MONO : {})}
            >
              {line}
            </text>
          ))}
        </g>
      );
    }

    if (node.kind === "code") {
      const w = Math.max(0, num(f.w, 0));
      const h = Math.max(0, num(f.h, 0));
      const lines = tag.text.split("\n");
      const lh = size * 1.7;
      const marked = new Set(pick(f.lines).split(",").filter(Boolean).map(Number));
      const top = -h / 2 + 10;
      return (
        <g key={node.id} transform={transform} opacity={opacity}>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={8} style={{ fill: paint(f.fill, "code"), stroke: paint(f.stroke, "rule") }} strokeWidth={1.2} />
          {lines.map((line, i) => (
            <g key={i} transform={`translate(${-w / 2} ${top + i * lh})`}>
              {marked.has(i + 1) && (
                <>
                  <rect x={1} width={w - 2} height={lh} style={{ fill: "var(--code-line-focus)" }} />
                  <rect x={1} width={3} height={lh} style={{ fill: "var(--accent)" }} />
                </>
              )}
              <text x={16} y={lh / 2} fontSize={size} dominantBaseline="central" style={{ fill: "var(--code-foreground)", whiteSpace: "pre" }} opacity={marked.size && !marked.has(i + 1) ? 0.45 : 1} {...MONO}>
                {line}
              </text>
            </g>
          ))}
        </g>
      );
    }
    return null;
  };

  return (
    <svg viewBox={`0 0 ${scene.w} ${scene.h}`} role="img" aria-label={label}>
      <g transform={view}>{ordered.map(draw)}</g>
    </svg>
  );
}

export function ScenePlayer({ scene, title }: { scene: Scene; title?: string }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { threshold: 0.45 });
  const visible = useVisible(ref);
  const last = scene.steps.length - 1;
  // 第几步（-1 是第一步之前的样子），以及这一步的动画放到了第几毫秒（Infinity 是放完了）
  const [index, setIndex] = useState(-1);
  const [t, setT] = useState(Infinity);
  // 正在放的那段动画；null 是停着
  const [anim, setAnim] = useState<{ index: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // 在演示里时，再乘上演示的整体速度
  const presentSpeed = usePresentSpeed();
  const rate = speed * presentSpeed;
  const rateRef = useRef(rate);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);
  const started = useRef(false);

  /** 去到第 i 步。animate 为真时把这一步的动画从头放一遍，否则直接显示它放完的样子 */
  const go = useCallback(
    (i: number, animate: boolean) => {
      const next = Math.max(-1, Math.min(last, i));
      setIndex(next);
      if (animate && next >= 0 && !prefersReducedMotion()) {
        setT(0);
        setAnim({ index: next });
      } else {
        setT(Infinity);
        setAnim(null);
      }
    },
    [last],
  );

  // 放动画：每一帧把时间往前推，画面跟着重新算
  useEffect(() => {
    if (!anim) return;
    const duration = scene.steps[anim.index].duration;
    let elapsed = 0;
    let prev = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      // 标签页切到后台再回来时，不要一下子跳过去
      elapsed += Math.min(100, now - prev) * rateRef.current;
      prev = now;
      if (elapsed >= duration) {
        setT(Infinity);
        setAnim(null);
        return;
      }
      setT(elapsed);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [anim, scene]);

  // 第一次滚到眼前时自动播放
  useEffect(() => {
    if (!inView || started.current || prefersReducedMotion()) return;
    started.current = true;
    // 在演示模式里由演示一步一步推进，不自己播放
    if (ref.current?.closest(".galley-present")) return;
    const timer = setTimeout(() => setPlaying(true), 500);
    return () => clearTimeout(timer);
  }, [inView]);

  // 自动播放：这一步的动画放完后，停够读完讲解的时间，再走下一步
  useEffect(() => {
    if (!playing || !visible || anim) return;
    if (index >= last) {
      const timer = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(timer);
    }
    const hold = index < 0 ? 0 : readingTime(scene.steps[index].text) / rate;
    const timer = setTimeout(() => go(index + 1, true), hold);
    return () => clearTimeout(timer);
  }, [playing, visible, anim, index, last, rate, scene, go]);

  // 演示模式按方向键时发来的"走一步"：能走就走，并告诉演示模式这一下已经用掉了
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onStep = (e: Event) => {
      const detail = (e as CustomEvent<{ dir: number; wait?: number; caption?: string }>).detail;
      const next = index + (detail.dir > 0 ? 1 : -1);
      if (next < -1 || next > last) return;
      e.preventDefault();
      setPlaying(false);
      // 字幕用讲稿（讲的时候说的话）；这一步没写讲稿时才用画面下面那句文字
      const spoken = (i: number) => scene.steps[i].say ?? scene.steps[i].text;
      if (detail.dir > 0) {
        detail.wait = (scene.steps[next].duration + readingTime(spoken(next))) / rate;
        detail.caption = spoken(next);
        go(next, true);
      } else {
        detail.caption = next >= 0 ? spoken(next) : undefined;
        go(next, false);
      }
    };
    el.addEventListener("galley-step", onStep);
    return () => el.removeEventListener("galley-step", onStep);
  }, [index, last, scene, rate, go]);

  // 打印、存成 PDF：显示最后的样子
  useEffect(() => {
    const finish = () => go(last, false);
    window.addEventListener("beforeprint", finish);
    const timer = ref.current?.closest(".galley-present[data-print]") ? setTimeout(finish, 0) : undefined;
    return () => {
      window.removeEventListener("beforeprint", finish);
      clearTimeout(timer);
    };
  }, [last, go]);

  const frame = useMemo(() => sceneFrame(scene, index, t), [scene, index, t]);
  const note = index >= 0 ? scene.steps[index].text : "";
  const toggle = () => {
    if (index >= last && !anim) {
      go(-1, false);
      setPlaying(true);
    } else setPlaying((p) => !p);
  };
  const manual = (i: number, animate: boolean) => {
    setPlaying(false);
    go(i, animate);
  };

  return (
    <figure
      ref={ref}
      className="galley-codesteps galley-scene"
      style={{ "--scene-ratio": scene.w / scene.h } as CSSProperties}
      tabIndex={0}
      data-steppable
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          manual(index + 1, true);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          manual(index - 1, false);
        } else if (e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <header className="galley-codesteps-head">
        <span className="galley-codesteps-file">{title ?? ""}</span>
        <span className="galley-codesteps-controls">
          <button type="button" onClick={() => manual(index - 1, false)} disabled={index < 0} aria-label="上一步" title="上一步（←）">
            <Icon d="M11 3 5 8l6 5" stroke />
          </button>
          <button type="button" className="galley-codesteps-play" onClick={toggle} aria-label={playing ? "暂停" : index >= last ? "重新播放" : "播放"} title="播放 / 暂停（空格）">
            {playing ? <Icon d="M5 3h2v10H5zM9 3h2v10H9z" /> : index >= last ? <Icon d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" stroke /> : <Icon d="M5 3l8 5-8 5z" />}
          </button>
          <button type="button" onClick={() => manual(index + 1, true)} disabled={index >= last} aria-label="下一步" title="下一步（→）">
            <Icon d="M5 3l6 5-6 5" stroke />
          </button>
          <button type="button" className="galley-codesteps-speed" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])} aria-label={`速度 ${speed} 倍，点击切换`} title="切换速度">
            {speed}×
          </button>
        </span>
        <span className="galley-codesteps-count">
          {Math.max(0, index + 1)} / {scene.steps.length}
        </span>
      </header>
      {/* 步骤进度：点哪一段跳到哪一步放完的样子 */}
      <span className="galley-codesteps-progress" aria-hidden="true">
        {scene.steps.map((_, i) => (
          <button key={i} type="button" tabIndex={-1} data-on={i <= index || undefined} onClick={() => manual(i, false)} aria-label={`第 ${i + 1} 步`} />
        ))}
      </span>
      <div className="galley-scene-stage">
        <SceneSvg scene={scene} frame={frame} label={[title, note].filter(Boolean).join("：") || "场景动画"} />
      </div>
      <div className="galley-codesteps-note" aria-live="polite">
        <div key={index} className="galley-codesteps-note-inner">
          {note}
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
