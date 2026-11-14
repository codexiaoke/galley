"use client";

import { useEffect, useId, useRef } from "react";
import { guidePlanSchema } from "../../core/studio-guides";
import type { GuidePlan } from "../../core/studio-types";
import { clamp, guideCameraFor, guideEase, HOME_CAMERA, mix, mixCamera, mixRect, projectRect, unprojectRect, type GuideCamera, type GuideRect } from "../guide-motion";

export type GuideReport = { seen: string[]; missing: string[] };
type GuideWindow = Window & { __galleyGuideReport?: GuideReport };

/** 同一受控时间轴驱动聚焦框和镜头；字幕位于镜头层之外。 */
export function GuideFocus() {
  const maskId = useId();
  const svg = useRef<SVGSVGElement>(null);
  const spotlight = useRef<SVGRectElement>(null), hole = useRef<SVGRectElement>(null), corners = useRef<SVGPathElement>(null);
  useEffect(() => {
    const stage = svg.current!.parentElement!, slides = stage.querySelector<HTMLElement>(".galley-present-slides")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const w = window as GuideWindow;
    const set = (element: Element, name: string, value: string | number) => {
      const text = typeof value === "number" ? value.toFixed(3) : value;
      if (element.getAttribute(name) !== text) element.setAttribute(name, text);
    };
    let plan: GuidePlan = [], beat: { id: string; at: number } | null = null;
    let currentKey = "", arrival = 0, frame = 0, exiting: number | null = null;
    let camera = HOME_CAMERA, cameraFrom = camera, exitCamera = camera;
    let focus: GuideRect | null = null, focusFrom: GuideRect | null = null;
    let focusAlpha = 0, focusAlphaFrom = 0, exitAlpha = 0;
    let shadeAlpha = 0, shadeAlphaFrom = 0, exitShadeAlpha = 0;
    let cameraTransform = "";
    const seen = new Set<string>(), missing = new Set<string>();
    const report = () => { w.__galleyGuideReport = { seen: [...seen], missing: [...missing] }; };
    const paintCamera = (value: GuideCamera) => {
      value = { x: Number(value.x.toFixed(3)), y: Number(value.y.toFixed(3)), scale: Number(value.scale.toFixed(5)) };
      camera = value;
      const transform = `translate(${value.x.toFixed(3)}px, ${value.y.toFixed(3)}px) scale(${value.scale.toFixed(5)})`;
      if (transform !== cameraTransform) { slides.style.transform = transform; cameraTransform = transform; }
      set(svg.current!, "data-guide-scale", value.scale);
    };
    const paintFocus = (rect: GuideRect | null, alpha: number, shade: number) => {
      set(spotlight.current!, "opacity", shade * 0.16);
      set(corners.current!, "opacity", alpha * 0.65);
      if (!rect || !alpha) return;
      const r = projectRect(rect, camera), width = stage.clientWidth, height = stage.clientHeight;
      const x = clamp(r.x, 12, width - 24), y = clamp(r.y, 12, height - 130);
      const right = clamp(r.x + r.width, x + 12, width - 12), bottom = clamp(r.y + r.height, y + 12, height - 118);
      set(hole.current!, "x", x); set(hole.current!, "y", y); set(hole.current!, "width", right - x); set(hole.current!, "height", bottom - y);
      const a = Math.min(24, (right - x) / 4, (bottom - y) / 4), radius = Math.min(12, a / 2);
      set(corners.current!, "d", `M${x} ${y+a}V${y+radius}Q${x} ${y} ${x+radius} ${y}H${x+a} M${right-a} ${y}H${right-radius}Q${right} ${y} ${right} ${y+radius}V${y+a} M${right} ${bottom-a}V${bottom-radius}Q${right} ${bottom} ${right-radius} ${bottom}H${right-a} M${x+a} ${bottom}H${x+radius}Q${x} ${bottom} ${x} ${bottom-radius}V${bottom-a}`);
    };
    const reset = () => {
      currentKey = ""; exiting = null; focus = null; focusAlpha = 0; shadeAlpha = 0;
      paintCamera(HOME_CAMERA); paintFocus(null, 0, 0);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.source !== "galley-studio" || event.data.type !== "guides") return;
      const parsed = guidePlanSchema.safeParse(event.data.plan);
      if (!parsed.success) return;
      plan = parsed.data; beat = null; reset(); seen.clear(); missing.clear(); report();
    };
    const onBeat = (event: Event) => {
      const next = (event as CustomEvent<{ id: string; at: number }>).detail;
      // 新页从全景开始；同页换目标则从正在显示的镜头自然接续。
      if (/^p\d+$/.test(next.id)) reset();
      beat = next;
    };
    const leave = (now: number) => {
      if (exiting === null) { exiting = now; exitCamera = camera; exitAlpha = focusAlpha; exitShadeAlpha = shadeAlpha; }
      const t = reduced ? 1 : guideEase((now - exiting) / 560);
      paintCamera(mixCamera(exitCamera, HOME_CAMERA, t));
      focusAlpha = exitAlpha * (1 - t); shadeAlpha = exitShadeAlpha * (1 - t);
      paintFocus(focus, focusAlpha, shadeAlpha);
      if (t === 1) { focus = null; currentKey = ""; }
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const cues = plan.find((item) => item.id === beat?.id)?.cues ?? [];
      const t = beat ? now - beat.at : 0;
      cues.forEach((cue, i) => {
        const key = `${beat!.id}/${i}`;
        if (t >= cue.endMs && !seen.has(key) && !missing.has(key)) {
          missing.add(key); report();
          window.parent.postMessage({ source: "galley-present", type: "guide-missing", targetId: cue.targetId }, "*");
        }
      });
      const index = cues.findIndex((cue) => t >= cue.startMs && t < cue.endMs), cue = cues[index];
      if (!cue) { leave(now); return; }
      const target = stage.querySelector<HTMLElement>(`[data-current] [data-galley-target="${CSS.escape(cue.targetId)}"]`);
      if (!target || target.dataset.guideVisible === "false" || target.closest('[hidden], [data-build="hidden"]') || !(target instanceof SVGElement ? target.ownerSVGElement : target)?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) { leave(now); return; }
      const rect = target.getBoundingClientRect(), bounds = stage.getBoundingClientRect();
      if (!rect.width && !rect.height) { leave(now); return; }
      const sx = stage.clientWidth / bounds.width, sy = stage.clientHeight / bounds.height;
      // 先消除本组件的镜头变换，避免把上次放大的结果当成下次的原始尺寸，形成缩放反馈。
      const base = unprojectRect({ x: (rect.left - bounds.left) * sx, y: (rect.top - bounds.top) * sy, width: rect.width * sx, height: rect.height * sy }, camera);
      const key = `${beat!.id}/${index}`;
      if (key !== currentKey || exiting !== null) {
        currentKey = key; arrival = now; cameraFrom = camera; focusFrom = focus; focusAlphaFrom = focusAlpha; shadeAlphaFrom = shadeAlpha; exiting = null;
      }
      const age = now - arrival, settle = reduced ? 1 : guideEase(age / 680);
      const desired = cue.emphasis === "zoom" && !reduced ? guideCameraFor(base, stage.clientWidth, stage.clientHeight) : HOME_CAMERA;
      paintCamera(mixCamera(cameraFrom, desired, settle));
      const focusTarget = { x: base.x - 16, y: base.y - 16, width: Math.max(24, base.width) + 32, height: Math.max(24, base.height) + 32 };
      focus = mixRect(focusFrom ?? focusTarget, focusTarget, reduced ? 1 : guideEase(age / 440));
      focusAlpha = mix(focusAlphaFrom, 1, reduced ? 1 : guideEase(age / 360));
      shadeAlpha = mix(shadeAlphaFrom, cue.emphasis === "point" ? 0 : 1, reduced ? 1 : guideEase(age / 360));
      paintFocus(focus, focusAlpha, shadeAlpha);
      set(svg.current!, "data-guide-emphasis", cue.emphasis);
      if (!seen.has(key) && focusAlpha > 0.1) { seen.add(key); report(); }
    };
    window.addEventListener("message", receive); window.addEventListener("galley-beat", onBeat);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); slides.style.removeProperty("transform"); window.removeEventListener("message", receive); window.removeEventListener("galley-beat", onBeat); };
  }, []);
  return <svg ref={svg} aria-hidden="true" data-galley-guide="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none", zIndex: 5 }}>
    <defs><mask id={maskId} maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white" /><rect ref={hole} rx="16" fill="black" /></mask></defs>
    <rect ref={spotlight} width="100%" height="100%" fill="var(--ink)" mask={`url(#${maskId})`} opacity="0" />
    <path ref={corners} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" opacity="0" />
  </svg>;
}
