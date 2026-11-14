"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type SVGProps } from "react";
import { isBlend, readingTime, sceneFrame, sceneTargetVisible, type FrameValue, type NodeFrame, type SceneFrame } from "@/core/scene/frame";
import type { Scene, SceneNode, SceneParam, SceneRatio } from "@/core/scene/types";
import { speakingTime } from "../captions";
import { arrowHead, curveDirection, curvePath, curvePoint, linkCurve, mixPoints, parsePoints, shapePath, type Curve, type End } from "../scene-geometry";
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
 *
 * 读者能动手的三样（场景里用到了才有）：
 * - 滑块：画面下面，调一个数；
 * - 能拖的点：画面上的小圆，直接拖；
 * - 点一下看说明：带说明的东西右上角有个小圆点。
 * 前两样一动，就带着新的数值把场景代码在后台线程的沙箱里重新跑一遍（scene-run-client.ts），
 * 换上新的画面；作者的代码始终不在页面里运行。
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

/** 图片只能是媒体库里的：沙箱交出来的地址不直接相信，这里再认一遍 */
const MEDIA_URL = /^\/media\/[a-z0-9]+\.[a-z0-9]+$/;

/** 自由画的线当时的形状：正在变形时是两个形状之间的样子 */
function pointsOf(v: FrameValue | undefined): number[][][] {
  if (v === undefined || typeof v === "number") return [];
  return isBlend(v) ? mixPoints(parsePoints(v.a), parsePoints(v.b), v.p) : parsePoints(v);
}

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

/** 谁压在谁上面：图片垫底，上面是边界框和圈出来的框，再上面是线，然后是方块和文字，沿线走的小圆点在最上面 */
const LAYER: Record<string, number> = { image: 0, frame: 1, link: 2, path: 2, box: 3, circle: 3, text: 3, code: 3, packet: 4 };

type HandleParam = Extract<SceneParam, { kind: "handle" }>;

function SceneSvg({
  scene,
  beat,
  frame,
  label,
  onDrag,
  onTip,
}: {
  scene: Scene;
  beat?: string;
  frame: SceneFrame;
  label: string;
  /** 读者拖动了一个点：x、y 是舞台上的位置 */
  onDrag?: (param: HandleParam, x: number, y: number) => void;
  /** 读者点了一个带说明的东西 */
  onTip?: (node: SceneNode, el: Element) => void;
}) {
  const byId = useMemo(() => new Map(scene.nodes.map((n) => [n.id, n])), [scene]);
  const handles = useMemo(() => new Map((scene.params ?? []).filter((p): p is HandleParam => p.kind === "handle").map((p) => [p.name, p])), [scene]);
  const cameraRef = useRef<SVGGElement>(null);
  /** 鼠标或手指在舞台上的位置：把屏幕上的点按镜头当时的变换换算回去 */
  const toStage = (e: ReactPointerEvent) => {
    const matrix = cameraRef.current?.getScreenCTM();
    return matrix ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()) : null;
  };
  /** 能拖、能点的东西：加在它外层那个 <g> 上的属性 */
  const interact = (node: SceneNode): SVGProps<SVGGElement> => {
    const param = node.handle ? handles.get(node.handle) : undefined;
    if (param && onDrag) {
      const drag = (e: ReactPointerEvent<SVGGElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const at = toStage(e);
        if (at) onDrag(param, at.x, at.y);
      };
      return {
        className: "galley-scene-handle",
        onPointerDown: (e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onPointerMove: drag,
      };
    }
    if (node.tip && onTip) return { className: "galley-scene-tip", onClick: (e) => onTip(node, e.currentTarget) };
    return {};
  };
  const ordered = useMemo(() => scene.nodes.filter((n) => n.kind !== "camera").sort((a, b) => (LAYER[a.kind] ?? 3) - (LAYER[b.kind] ?? 3)), [scene]);
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

    const grab = interact(node);
    const x = num(f.x, 0) + num(f.ox, 0);
    const y = num(f.y, 0) + num(f.oy, 0);
    const transform = `translate(${x} ${y}) rotate(${num(f.rotate, 0)}) scale(${num(f.scale, 1)})`;
    const size = Math.max(4, num(f.size, 15));
    const color = paint(f.color, "ink");
    const tag = words(f.text);
    const dash = num(f.dashed, 0) ? "5 4" : undefined;

    if (node.kind === "image") {
      const src = pick(f.src);
      if (!MEDIA_URL.test(src)) return null;
      const w = Math.max(0, num(f.w, 0));
      const h = Math.max(0, num(f.h, 0));
      return (
        <g key={node.id} transform={transform} opacity={opacity} {...grab}>
          <image href={src} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="xMidYMid meet" style={{ clipPath: `inset(0 round ${Math.max(0, num(f.radius, 8))}px)` }} />
        </g>
      );
    }

    if (node.kind === "path") {
      const segments = pointsOf(f.points);
      const t = clamp01(num(f.draw, 0));
      if (!segments.length || t <= 0.001) return null;
      const drawn = t >= 0.999;
      return (
        <g key={node.id} transform={transform} opacity={opacity} {...grab}>
          <path
            d={shapePath(segments, num(f.closed, 0) > 0, num(f.smooth, 0) > 0)}
            // 画出来的过程：把整条线的长度当成 1，露出前面 t 这一段；画完以后才显示成虚线
            pathLength={drawn ? undefined : 1}
            strokeDasharray={drawn ? (num(f.dashed, 0) ? "5 5" : undefined) : "1 1"}
            strokeDashoffset={drawn ? undefined : 1 - t}
            style={{ fill: paint(f.fill, "none"), stroke: paint(f.stroke, "ink") }}
            fillOpacity={t * t}
            strokeWidth={Math.max(0.5, num(f.width, 1.8))}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    }

    if (node.kind === "box" || node.kind === "frame") {
      const w = Math.max(0, num(f.w, 0));
      const h = Math.max(0, num(f.h, 0));
      const sub = words(f.sub);
      return (
        <g key={node.id} transform={transform} opacity={opacity} {...grab}>
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
        <g key={node.id} transform={transform} opacity={opacity} {...grab}>
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
        <g key={node.id} transform={transform} opacity={opacity * tag.alpha} {...grab}>
          {/* 带说明的文字：整块都能点，不用正好点在笔画上 */}
          {node.tip && (
            <rect x={align === "start" ? -4 : align === "end" ? -num(f.w, 0) - 4 : -num(f.w, 0) / 2 - 4} y={-(lines.length * lh) / 2 - 2} width={num(f.w, 0) + 8} height={lines.length * lh + 4} fill="transparent" />
          )}
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
        <g key={node.id} transform={transform} opacity={opacity} {...grab}>
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
      <g ref={cameraRef} transform={view}>
        {ordered.map((node) => <g key={node.id} data-galley-target={beat ? `${beat}:${node.id}` : undefined} data-guide-kind={node.kind} data-guide-visible={sceneTargetVisible(frame[node.id]) ? "true" : "false"}>{draw(node)}</g>)}
        {/* 提示读者"这里能动"：能拖的点外面一圈会呼吸的环，带说明的东西右上角一个小圆点 */}
        {ordered.map((node) => {
          const f = frame[node.id];
          if (!f || clamp01(num(f.opacity, 0)) < 0.6 || !((node.handle && onDrag) || (node.tip && onTip))) return null;
          const box = endOf(node, f);
          return node.handle ? (
            <circle key={`hint-${node.id}`} className="galley-scene-handle-ring" cx={box.cx} cy={box.cy} r={box.hw + 5} />
          ) : (
            <circle key={`hint-${node.id}`} className="galley-scene-tip-dot" cx={box.cx + box.hw} cy={box.cy - box.hh} r={4} />
          );
        })}
      </g>
    </svg>
  );
}

/** 滑块上显示的数：按步长留小数位 */
const formatValue = (value: number, step: number) => {
  const digits = Math.min(4, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
  return value.toFixed(digits);
};

export function ScenePlayer({
  scene,
  title,
  source,
  ratio = "16:9",
  beat,
}: {
  scene: Scene;
  title?: string;
  /** 场景的代码（已经去掉讲稿）。场景里有读者能调的东西时才给：读者一动，要带着新的数值重新运行 */
  source?: string;
  ratio?: SceneRatio;
  /** 这个场景在讲稿清单里的名字（它的指纹）。每一步的名字是 <它>.<第几步>，演示按这个名字找做视频的工具给的时长 */
  beat?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.45 });
  const visible = useVisible(ref);
  // 读者调过参数以后重新运行出来的场景；没调过时用服务端给的那一份
  const [live, setLive] = useState<Scene | null>(null);
  const current = live ?? scene;
  const [values, setValues] = useState<Record<string, number>>({});
  const [tip, setTip] = useState<{ id: string; index: number; text: string; left: number; top: number; below: boolean; align: "start" | "center" | "end" } | null>(null);
  const last = current.steps.length - 1;
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
    const duration = current.steps[anim.index].duration;
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
  }, [anim, current]);

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
    const hold = index < 0 ? 0 : readingTime(current.steps[index].text) / rate;
    const timer = setTimeout(() => go(index + 1, true), hold);
    return () => clearTimeout(timer);
  }, [playing, visible, anim, index, last, rate, current, go]);

  // 演示模式按方向键时发来的"走一步"：能走就走，并告诉演示模式这一下已经用掉了
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onStep = (e: Event) => {
      const detail = (e as CustomEvent<{ dir: number; wait?: number; caption?: string; beat?: string; anim?: number }>).detail;
      const next = index + (detail.dir > 0 ? 1 : -1);
      if (next < -1 || next > last) return;
      e.preventDefault();
      setPlaying(false);
      // 字幕用讲稿（讲的时候说的话）；这一步没写讲稿时才用画面下面那句文字
      const spoken = (i: number) => current.steps[i].say ?? current.steps[i].text;
      if (detail.dir > 0) {
        const step = current.steps[next];
        // 有讲稿时：边放动画边讲，动画放完、话也说完了才走下一步；没有讲稿时：动画放完再留出读那句文字的时间
        detail.wait = (step.say ? Math.max(step.duration, speakingTime(step.say)) + 500 : step.duration + readingTime(step.text)) / rate;
        detail.caption = spoken(next);
        detail.beat = beat ? `${beat}.${next}` : undefined;
        detail.anim = step.duration / rate;
        go(next, true);
      } else {
        detail.caption = next >= 0 ? spoken(next) : undefined;
        go(next, false);
      }
    };
    el.addEventListener("galley-step", onStep);
    return () => el.removeEventListener("galley-step", onStep);
  }, [index, last, current, rate, go, beat]);

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

  const frame = useMemo(() => sceneFrame(current, index, t), [current, index, t]);
  const note = index >= 0 ? current.steps[Math.min(index, last)].text : "";

  // ---- 读者动手：带着新的数值重新运行 ----
  const sliders = (current.params ?? []).filter((p): p is Extract<SceneParam, { kind: "slider" }> => p.kind === "slider");
  const interactive = !!source && (scene.params?.length ?? 0) > 0;
  const wanted = useRef<Record<string, number> | null>(null);
  const busy = useRef(false);
  /** 把最新的一组数值交给后台线程。上一次还没跑完时先记着，跑完马上接着跑最新的（中间的直接跳过） */
  const rerun = useCallback(async () => {
    if (busy.current || !wanted.current || !source) return;
    busy.current = true;
    const next = wanted.current;
    wanted.current = null;
    // 全景沿用服务端那一份的镜头：不然一边拖，整个画面一边缩放
    const camera = scene.nodes.find((n) => n.kind === "camera")?.props;
    const home = camera ? { x: Number(camera.x), y: Number(camera.y), zoom: Number(camera.zoom) } : undefined;
    const { rerunScene } = await import("./scene-run-client");
    const result = await rerunScene(source, ratio, { values: next, home });
    busy.current = false;
    // 出错（比如某个数值让代码算不下去）时保持上一个画面
    if (result.ok) setLive(result.scene);
    if (wanted.current) void rerun();
  }, [source, ratio, scene]);
  const change = (patch: Record<string, number>) => {
    const next = { ...values, ...patch };
    setValues(next);
    setPlaying(false);
    setTip(null);
    wanted.current = next;
    void rerun();
  };
  const reset = () => {
    wanted.current = null;
    setValues({});
    setLive(null);
  };
  const onDrag = (param: Extract<SceneParam, { kind: "handle" }>, x: number, y: number) => {
    const patch: Record<string, number> = {};
    if (param.axis !== "y") patch[`${param.name}_x`] = Math.min(param.maxX, Math.max(param.minX, x));
    if (param.axis !== "x") patch[`${param.name}_y`] = Math.min(param.maxY, Math.max(param.minY, y));
    change(patch);
  };
  /** 点了带说明的东西：说明显示在它旁边（上半边的显示在下面，下半边的显示在上面） */
  const onTip = (node: SceneNode, el: Element) => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage || !node.tip) return;
    if (tip?.id === node.id && tip.index === index) return setTip(null);
    const box = el.getBoundingClientRect();
    const below = box.top + box.height / 2 < stage.top + stage.height / 2;
    const left = ((box.left + box.width / 2 - stage.left) / stage.width) * 100;
    setPlaying(false);
    setTip({
      id: node.id,
      index,
      text: node.tip,
      left,
      top: (((below ? box.bottom : box.top) - stage.top) / stage.height) * 100,
      below,
      // 靠左的往右展开，靠右的往左展开：气泡不伸到画面外面去
      align: left < 35 ? "start" : left > 65 ? "end" : "center",
    });
  };
  // 换了一步，上一步点开的说明就不显示了
  const shownTip = tip && tip.index === index ? tip : null;
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
      style={{ "--scene-ratio": current.w / current.h } as CSSProperties}
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
          {Math.max(0, index + 1)} / {current.steps.length}
        </span>
      </header>
      {/* 步骤进度：点哪一段跳到哪一步放完的样子 */}
      <span className="galley-codesteps-progress" aria-hidden="true">
        {current.steps.map((_, i) => (
          <button key={i} type="button" tabIndex={-1} data-on={i <= index || undefined} onClick={() => manual(i, false)} aria-label={`第 ${i + 1} 步`} />
        ))}
      </span>
      <div ref={stageRef} className="galley-scene-stage" onClick={(e) => e.target === e.currentTarget && setTip(null)}>
        <SceneSvg scene={current} beat={beat} frame={frame} label={[title, note].filter(Boolean).join("：") || "场景动画"} onDrag={interactive ? onDrag : undefined} onTip={onTip} />
        {shownTip && (
          <p className="galley-scene-tipbox" data-below={shownTip.below || undefined} data-align={shownTip.align} style={{ left: `${shownTip.left}%`, top: `${shownTip.top}%` }} role="status">
            {shownTip.text}
          </p>
        )}
      </div>
      {interactive && sliders.length > 0 && (
        <div className="galley-scene-controls">
          {sliders.map((p) => {
            const value = values[p.name] ?? p.initial;
            return (
              <label key={p.name}>
                <span>{p.label}</span>
                <input type="range" min={p.min} max={p.max} step={p.step} value={value} onChange={(e) => change({ [p.name]: Number(e.target.value) })} />
                <output>{formatValue(value, p.step)}</output>
              </label>
            );
          })}
          <button type="button" onClick={reset} disabled={Object.keys(values).length === 0}>
            还原
          </button>
        </div>
      )}
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
