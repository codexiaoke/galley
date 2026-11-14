import { memo, useEffect, useRef, useState } from "react";
import { LoaderCircle, Play, Square } from "lucide-react";
import { buttonClass } from "../../src/app/admin/ui";
import type { StudioRevision } from "../../src/core/studio-types";
import { resolveGuidePlan } from "../../src/core/studio-guides";
import { beatLength } from "./timing.js";

/** 审查预览使用当前讲稿的时长和不可变音频；来源版本变化时页面会拒绝加载。 */
export const PresentationPreview = memo(function PresentationPreview({ revision }: { revision: StudioRevision }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [error, setError] = useState(""), [subtitle, setSubtitle] = useState("");
  const [sequence, setSequence] = useState(0);
  const players = useRef(new Map<string, HTMLAudioElement>());
  const current = useRef<{ id: string; audio: HTMLAudioElement } | null>(null);
  const running = useRef(false);
  const url = new URL(revision.source.present, revision.source.galley);
  url.searchParams.set("version", revision.source.version); url.searchParams.set("controlled", "1"); url.searchParams.set("captions", "space");
  url.searchParams.set("timing", revision.beats.map((beat) => `${beat.id}:${beatLength(beat, revision.voices.find((voice) => voice.id === beat.id))}`).join(","));
  useEffect(() => {
    const audio = new Map(revision.voices.map((voice) => { const player = new Audio(voice.audio); player.preload = "auto"; return [voice.id, player]; }));
    players.current = audio;
    return () => { audio.forEach((player) => player.pause()); };
  }, [revision.voices]);
  useEffect(() => {
    const stop = () => { players.current.forEach((player) => { player.pause(); player.currentTime = 0; }); current.current = null; };
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.origin !== new URL(revision.source.galley).origin || event.data?.source !== "galley-present") return;
      if (event.data.type === "ready") { setReady(true); setError(""); }
      if (event.data.type === "guide-missing") setError(`讲解指向未找到可见目标（${event.data.targetId}），请检查这一拍的指向与动画时机。`);
      if (event.data.type === "beat" && running.current && current.current?.id !== event.data.id) {
        stop(); const player = players.current.get(event.data.id);
        if (player) { current.current = { id: event.data.id, audio: player }; void player.play().catch(() => setError("声音播放失败，请停止后重新预览。")); }
      }
      if (event.data.type === "done") { stop(); running.current = false; setPlaying(false); setSubtitle(""); }
    };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [revision.source.galley]);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setError("画面未能载入。请检查站点；如果文章已更新，请同步来源后重新审查。"), 20000);
    return () => clearTimeout(timer);
  }, [ready, sequence]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => { const now = current.current; const cue = now && revision.voices.find((voice) => voice.id === now.id)?.cues.find((cue) => now.audio.currentTime >= cue.start && now.audio.currentTime < cue.end); setSubtitle(cue?.text ?? ""); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, revision.voices]);
  const reset = () => { running.current = false; players.current.forEach((audio) => { audio.pause(); audio.currentTime = 0; }); current.current = null; setPlaying(false); setSubtitle(""); setReady(false); setError(""); setSequence((value) => value + 1); };
  const play = () => {
    try {
      const plan = resolveGuidePlan(revision.beats, revision.voices, true);
      iframe.current?.contentWindow?.postMessage({ source: "galley-studio", type: "guides", plan }, new URL(revision.source.galley).origin);
      running.current = true; setPlaying(true); setError("");
      iframe.current?.contentWindow?.postMessage({ source: "galley-studio", type: "start" }, new URL(revision.source.galley).origin);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  return <>
    <div className="studio-preview"><iframe ref={iframe} key={sequence} src={url.toString()} title="当前版本的画面预览" allow="autoplay" />
      {!ready && <div className="studio-preview-loading">{error ? <p className="px-6 text-center text-sm">{error}</p> : <><LoaderCircle size={18} className="animate-spin" />正在准备画面…</>}</div>}
      {subtitle && <div className="studio-subtitle"><span>{subtitle}</span></div>}
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><button className={buttonClass()} disabled={!ready || playing} onClick={play}><Play size={14} />播放预览</button><button className={buttonClass("link")} onClick={reset}><Square size={13} />{error ? "重新载入" : "回到封面"}</button></div>
    {revision.beats.some((beat) => beat.guides?.length && !revision.voices.some((voice) => voice.id === beat.id)) && <p className="mt-2 text-xs text-a-muted">尚未配音的拍点按讲稿估时预览；配音后指针将随实际字幕时间对齐。</p>}
    {ready && error && <p className="mt-2 text-xs text-a-danger">{error}</p>}
  </>;
}, (before, after) => before.revision.id === after.revision.id && before.revision.voices.map((voice) => voice.audio).join() === after.revision.voices.map((voice) => voice.audio).join());
