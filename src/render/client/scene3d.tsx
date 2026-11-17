"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene3D } from "@/core/scene3d/schema";
import { createScene3DWorld } from "./scene3d-world";
import { createScenePlayback } from "./scene-playback";

type Props = { id: string; title: string; scene: Scene3D; fullScreen?: boolean; controlled?: boolean; timing?: Record<string, number> };
type FilmWindow = Window & { __galleyTimeline?: { id: string; at: number }[]; __galleyPresentDone?: boolean };

/** 纯三维电影舞台：同一场景连续运镜，直接以工坊的拍点时钟驱动设备。 */
export function Scene3DPlayer({ id, title, scene, fullScreen = false, controlled = false, timing }: Props) {
  const root = useRef<HTMLElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = root.current!, surface = canvas.current!, filmWindow = window as FilmWindow;
    let cancelled = false, cleanup: (() => void) | undefined;
    const setup = async () => {
      let world: Awaited<ReturnType<typeof createScene3DWorld>>;
      try { world = await createScene3DWorld(surface, element, scene);
        if (cancelled) { world.dispose(); return; } }
      catch (cause) {
        if (cancelled) return;
        element.dataset.error = cause instanceof Error ? cause.message : "三维场景资源加载失败";
        setError(element.dataset.error); return;
      }
      let offset = 0;
      const starts = scene.shots.map((shot) => { const start=offset; offset+=shot.duration; return start; });
      const steps = scene.shots.map((shot, i) => {
        const duration = Math.max(shot.duration, timing?.[`${id}.${i}`] ?? 0);
        return { duration, stay: duration };
      });
      let loggedIndex = -1;
      const tell = (data: object) => {
        if (fullScreen) window.parent.postMessage({ source: "galley-present", ...data }, "*");
      };
      const playback = createScenePlayback({
        element, id, steps, speed: () => 1,
        draw(index, elapsed) {
          const time = index < 0 ? 0 : starts[index] + Math.min(1, elapsed / steps[index].stay) * scene.shots[index].duration;
          return world.draw(time);
        },
        changed(index) {
          if (!fullScreen || index < 0 || index === loggedIndex) return;
          loggedIndex = index;
          const entry = { id: `${id}.${index}`, at: Math.round(performance.now()) };
          (filmWindow.__galleyTimeline ??= []).push(entry);
          window.dispatchEvent(new CustomEvent("galley-beat", { detail: entry }));
          tell({ type: "beat", ...entry });
        },
        finished() {
          if (fullScreen) filmWindow.__galleyPresentDone = true;
          tell({ type: "done" });
        },
      });
      const start = () => {
        loggedIndex = -1;
        if (fullScreen) { filmWindow.__galleyTimeline = []; filmWindow.__galleyPresentDone = false; }
        playback.go(0, true, true);
      };
      const onMessage = (event: MessageEvent) => {
        if (controlled && event.source === window.parent && event.data?.source === "galley-studio" && event.data.type === "start") start();
      };
      const onKey = (event: KeyboardEvent) => {
        if (!fullScreen || controlled || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.code === "Space") { event.preventDefault(); playback.toggle(); }
        if (event.key.toLowerCase() === "r") start();
        if (event.key.toLowerCase() === "f") {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void element.requestFullscreen();
        }
      };
      const onLost = (event: Event) => {
        event.preventDefault(); element.dataset.error = "WebGL 上下文丢失，请重新加载"; setError(element.dataset.error);
      };
      window.addEventListener("message", onMessage); window.addEventListener("keydown", onKey);
      surface.addEventListener("webglcontextlost", onLost);
      element.dataset.ready = "true";
      const readyFrame = requestAnimationFrame(() => { tell({ type: "ready" }); if (!controlled && (fullScreen || !element.closest(".galley-present"))) start(); });
      cleanup = () => {
        delete element.dataset.ready;
        cancelAnimationFrame(readyFrame); playback.dispose(); world.dispose();
        window.removeEventListener("message", onMessage); window.removeEventListener("keydown", onKey);
        surface.removeEventListener("webglcontextlost", onLost);
      };
    };
    void setup();
    return () => { cancelled = true; cleanup?.(); };
  }, [id, scene, fullScreen, controlled, timing]);
  return (
    <section ref={root} className={`galley-scene3d${fullScreen ? " galley-scene3d-film galley-present-stage" : ""}`} data-render-surface="scene3d" data-steppable={!fullScreen ? "scene3d" : undefined} aria-label={title}>
      <canvas ref={canvas} aria-label={title} />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
