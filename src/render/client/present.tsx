"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { download, prepareRecording, recordingSupport, type Recording, type RecordingSupport } from "./recorder";
import { formatSpeed, PresentSpeed, SPEEDS } from "./speed";

/**
 * 演示模式：文章变成全屏的幻灯片。
 *
 * 翻页的规则：按"下一步"时，先问当前这一页里的动画（代码演变、算法动画……）还要不要往下走
 * ——给它们发一个 "galley-step" 事件，哪个接了（preventDefault）就算这一步用掉了；
 * 都不接（动画已经播完了，或者这一页没有动画），才翻到下一页。"上一步"同理。
 *
 * 幻灯片按固定的设计尺寸排版（横屏 1600×900，竖屏 900×1600），整体缩放到窗口大小，
 * 所以在什么屏幕上看、录成视频，排版都一样。内容太多放不下时整页缩小一点。
 *
 * 自动播放：一步一步自己往下走，每一步停留的时间由动画告诉我们（事件里的 wait），
 * 没有动画的页按讲稿或页面文字的长短估一个时间；讲稿作为字幕显示在下面。
 *
 * 录制视频（见 recorder.ts）：在浏览器里录这个标签页，只录幻灯片那一块。
 * 可以自动播放，也可以自己翻页、同时用麦克风配音。录完直接下载，不上传。
 */

export type PresentSlide = { title?: string; section?: string; notes: string; text: number; content: ReactNode };
export type Cover = { title: string; summary?: string; site: string; date?: string; url?: string };
type Orientation = "landscape" | "portrait";

type StepDetail = { dir: number; wait?: number; caption?: string };
type RecState = "idle" | "setup" | "countdown" | "recording" | "saving" | "done";
type RecOptions = { orientation: Orientation; captions: boolean; mic: boolean; pacing: "auto" | "manual"; speed: number };

const DESIGN = { landscape: { w: 1600, h: 900 }, portrait: { w: 900, h: 1600 } };
/** 录制时，幻灯片下面留出一条放录制提示，这条不在录制区域里 */
const REC_BAR = 52;

const formatTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Presentation({
  cover,
  slides,
  backHref,
  auto: autoParam = false,
  orientation: orientationParam = "landscape",
  captions: captionsParam = false,
  durations,
}: {
  cover: Cover;
  slides: PresentSlide[];
  backHref: string;
  auto?: boolean;
  orientation?: Orientation;
  captions?: boolean;
  /** 每一页至少停留多久（毫秒） */
  durations?: number[];
}) {
  // 第 0 页是封面，最后一页是结尾
  const total = slides.length + 2;
  const [page, setPage] = useState(0);
  const [auto, setAuto] = useState(autoParam);
  const [orientation, setOrientation] = useState<Orientation>(orientationParam);
  const [captions, setCaptions] = useState(captionsParam);
  const [run, setRun] = useState(0); // 变了就把所有页重新挂载，动画回到开头
  // 自动播放的速度：翻页的停留时间和页里的动画一起按这个速度走（见 speed.ts）
  const [speed, setSpeed] = useState(1);
  const changeSpeed = (dir: number) => setSpeed((v) => SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v) + dir))]);
  const [scale, setScale] = useState(1);
  const [chrome, setChrome] = useState(!autoParam);
  const [showNotes, setShowNotes] = useState(false);
  // 字幕：这一页有讲稿时用讲稿，没有时用页里动画当前这一步的说明
  const [stepCaption, setStepCaption] = useState<{ page: number; text: string } | null>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const size = DESIGN[orientation];

  // ---- 录制 ----
  const [rec, setRec] = useState<RecState>("idle");
  const [recOptions, setRecOptions] = useState<RecOptions>({ orientation: orientationParam, captions: true, mic: false, pacing: "auto", speed: 1 });
  const [support, setSupport] = useState<RecordingSupport | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ url: string; filename: string; width: number; height: number } | null>(null);
  const recording = useRef<Recording | null>(null);
  const recStarted = useRef(0);
  const recording_ = rec === "countdown" || rec === "recording";

  // 缩放到窗口大小（录制时下面留出提示条）
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / size.w, (window.innerHeight - (recording_ ? REC_BAR : 0)) / size.h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [size.w, size.h, recording_]);

  // 内容放不下时整页缩小：文字、播放器、按钮一起等比缩小（只缩字的话播放器还是会超出去）。
  // 用 transform 缩放不影响元素自己的高度，所以可以一直拿它和可用的高度比；
  // 再用负的下边距把缩小后多出来的空白收回去，页面里的垂直居中才是对的。
  // 内容的高度会变（比如 Mermaid 图加载完、动画换了一页），所以一直盯着它重新算。
  useLayoutEffect(() => {
    const slide = slideRefs.current[page];
    const el = slide?.querySelector<HTMLElement>(".galley-slide-body");
    if (!slide || !el) return;
    const fit = () => {
      const style = getComputedStyle(slide);
      const available = slide.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const natural = el.offsetHeight;
      const f = natural > available ? Math.max(0.5, available / natural) : 1;
      el.style.transform = f < 1 ? `scale(${f})` : "";
      el.style.marginBottom = f < 1 ? `${-natural * (1 - f)}px` : "";
      // 缩到最小还放不下时从顶部开始排，至少标题和开头不会被裁掉
      if (natural * f > available + 1) slide.dataset.overflow = "true";
      else delete slide.dataset.overflow;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page, run, orientation]);

  /** 让当前页里的动画走一步；返回它接没接，以及建议等多久再走下一步 */
  const stepInside = useCallback(
    (dir: number): StepDetail | null => {
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
    },
    [page],
  );

  const move = useCallback(
    (dir: number) => {
      const inner = stepInside(dir);
      if (inner) {
        if (inner.caption) setStepCaption({ page, text: inner.caption });
        return inner;
      }
      setPage((p) => Math.max(0, Math.min(total - 1, p + dir)));
      return null;
    },
    [stepInside, total, page],
  );

  const stopRecording = useCallback(async () => {
    const r = recording.current;
    if (!r) return;
    recording.current = null;
    setRec("saving");
    const { width, height } = r.size();
    const { blob, ext } = await r.stop();
    const url = URL.createObjectURL(blob);
    const filename = `${cover.title}-${orientation === "portrait" ? "竖屏" : "横屏"}.${ext}`;
    download(url, filename);
    setResult({ url, filename, width, height });
    setRec("done");
    setAuto(autoParam);
  }, [cover.title, orientation, autoParam]);

  /** 点"开始录制"：这一下必须直接来自点击，浏览器才肯弹出选择窗口 */
  const startRecording = async () => {
    setRecError(null);
    setOrientation(recOptions.orientation);
    setCaptions(recOptions.captions);
    if (recOptions.pacing === "auto") setSpeed(recOptions.speed);
    try {
      const r = await prepareRecording({
        region: stageRef.current!,
        mic: recOptions.mic,
        onEnded: () => void stopRecording(),
      });
      recording.current = r;
      // 从头开始：回到封面，所有动画重新挂载
      setPage(0);
      setRun((n) => n + 1);
      setStepCaption(null);
      setShowNotes(false);
      setCountdown(3);
      setRec("countdown");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setRecError(
        name === "NotAllowedError"
          ? "没有得到录制的权限。点开始录制后，在弹出的窗口里选择「这个标签页」并点共享；用麦克风时还要允许使用麦克风。"
          : `开始录制失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  // 倒计时，结束后开始写入
  useEffect(() => {
    if (rec !== "countdown") return;
    if (countdown <= 0) {
      const t = setTimeout(() => {
        recording.current?.begin();
        recStarted.current = Date.now();
        setElapsed(0);
        setAuto(recOptions.pacing === "auto");
        setRec("recording");
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [rec, countdown, recOptions.pacing]);

  // 录制计时
  useEffect(() => {
    if (rec !== "recording") return;
    const t = setInterval(() => setElapsed(Date.now() - recStarted.current), 500);
    return () => clearInterval(t);
  }, [rec]);

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (rec === "setup" || rec === "done" || rec === "saving" || rec === "countdown") {
        if (e.key === "Escape" && (rec === "setup" || rec === "done")) setRec("idle");
        return;
      }
      if (e.key === "Escape") {
        if (rec === "recording") void stopRecording();
        else if (!document.fullscreenElement) window.location.href = backHref;
        return;
      }
      const next = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key);
      const prev = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key);
      if (next || prev) {
        // 录制中的自动播放不让打断；平时自动播放时按方向键就停下来，改成手动翻
        if (auto && rec === "recording") return;
        e.preventDefault();
        if (auto) setAuto(false);
        move(next ? 1 : -1);
      } else if (rec === "idle") {
        if (e.key === "a" || e.key === "A") setAuto((v) => !v);
        else if (e.key === "-" || e.key === "_") changeSpeed(-1);
        else if (e.key === "=" || e.key === "+") changeSpeed(1);
        else if (e.key === "Home") setPage(0);
        else if (e.key === "End") setPage(total - 1);
        else if (e.key === "f" || e.key === "F") {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.();
        } else if (e.key === "n" || e.key === "N") setShowNotes((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auto, move, total, backHref, rec, stopRecording]);

  // 控制条：鼠标不动两秒后隐藏
  useEffect(() => {
    if (autoParam && rec === "idle") return;
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
  }, [autoParam, rec]);

  // 自动播放
  useEffect(() => {
    if (!auto || rec === "countdown") return;
    const w = window as unknown as { __galleyPresentDone?: boolean; __galleyPage?: number };
    w.__galleyPage = page;
    if (page >= total - 1) {
      const t = setTimeout(() => {
        w.__galleyPresentDone = true;
        if (rec === "recording") void stopRecording();
        else if (!autoParam) setAuto(false);
      }, 2500 / speed);
      return () => clearTimeout(t);
    }
    const slide = page >= 1 ? slides[page - 1] : null;
    // 这一页至少停留多久：给定的时长，否则按讲稿或页面文字估
    const reading = (durations?.[page] ?? (slide ? Math.min(14000, Math.max(3500, ((slide.notes.length || slide.text) * 1000) / 7)) : 3500)) / speed;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const tick = () => {
      if (cancelled) return;
      const inner = stepInside(1);
      if (inner) {
        if (inner.caption) setStepCaption({ page, text: inner.caption });
        // 页里动画给的等待时间已经按速度算过了（它们也在用同一个速度）
        timer = setTimeout(tick, inner.wait ?? 600);
        return;
      }
      const left = reading - (Date.now() - started);
      if (left > 0) timer = setTimeout(tick, left);
      else setPage((p) => p + 1);
    };
    // 先让这一页显示出来、动画开始，再开始往下走
    timer = setTimeout(tick, 1200 / speed);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auto, autoParam, speed, page, total, slides, stepInside, durations, rec, stopRecording]);

  // 结果里的视频地址用完就释放
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);

  const current = page >= 1 && page <= slides.length ? slides[page - 1] : null;
  const caption = current ? current.notes || (stepCaption?.page === page ? stepCaption.text : null) : null;
  const idle = rec === "idle";

  return (
    <div
      className="galley-present"
      data-orientation={orientation}
      data-captions={captions || undefined}
      data-chrome={chrome || undefined}
      data-recording={recording_ || undefined}
      onClick={(e) => idle && !auto && e.target === e.currentTarget && move(1)}
    >
      <div
        ref={stageRef}
        className="galley-present-stage"
        style={{ width: size.w, height: size.h, top: recording_ ? `calc(50% - ${REC_BAR / 2}px)` : "50%", transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties}
      >
        <PresentSpeed.Provider value={speed}>
        <div key={run} className="galley-present-slides">
          <section ref={(el) => void (slideRefs.current[0] = el)} className="galley-slide galley-slide-cover" data-current={page === 0 || undefined} hidden={page !== 0}>
            <p className="galley-slide-site">{cover.site}</p>
            <h1>{cover.title}</h1>
            {cover.summary && <p className="galley-slide-summary">{cover.summary}</p>}
            {cover.date && <p className="galley-slide-date">{cover.date}</p>}
          </section>
          {slides.map((s, i) => (
            <section key={i} ref={(el) => void (slideRefs.current[i + 1] = el)} className="galley-slide" data-current={page === i + 1 || undefined} hidden={page !== i + 1}>
              <div className="galley-slide-body galley-prose">
                {s.section && <p className="galley-slide-section">{s.section}</p>}
                {s.content}
              </div>
            </section>
          ))}
          <section ref={(el) => void (slideRefs.current[total - 1] = el)} className="galley-slide galley-slide-cover" data-current={page === total - 1 || undefined} hidden={page !== total - 1}>
            <h1>{cover.title}</h1>
            <p className="galley-slide-site">{cover.site}</p>
            {cover.url && <p className="galley-slide-date">{cover.url.replace(/^https?:\/\//, "")}</p>}
          </section>
        </div>
        </PresentSpeed.Provider>
        {captions && caption && (
          <p key={caption} className="galley-present-caption">
            {caption}
          </p>
        )}
      </div>

      {idle && !autoParam && (
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
            <button type="button" className="galley-present-auto" onClick={() => setAuto((v) => !v)} aria-pressed={auto} title="自动播放（A）">
              {auto ? "❚❚ 暂停" : "▶ 自动播放"}
            </button>
            <span className="galley-present-speed" role="group" aria-label="自动播放的速度">
              <button type="button" onClick={() => changeSpeed(-1)} disabled={speed === SPEEDS[0]} aria-label="慢一点" title="慢一点（-）">
                −
              </button>
              <span>{formatSpeed(speed)}</span>
              <button type="button" onClick={() => changeSpeed(1)} disabled={speed === SPEEDS[SPEEDS.length - 1]} aria-label="快一点" title="快一点（=）">
                +
              </button>
            </span>
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
            <button
              type="button"
              className="galley-present-rec-button"
              onClick={() => {
                setSupport(recordingSupport());
                setRec("setup");
              }}
              title="录成视频"
            >
              <i aria-hidden="true" /> 录制
            </button>
          </nav>
          {showNotes && (
            <aside className="galley-present-notes">
              <strong>{current ? (current.title ?? `第 ${page} 页`) : page === 0 ? "封面" : "结尾"}</strong>
              <p>{current ? current.notes || "这一页没有讲稿。" : ""}</p>
            </aside>
          )}
        </>
      )}

      {rec === "setup" && support && (
        <div className="galley-present-dialog" role="dialog" aria-label="录制视频">
          <h2>录成视频</h2>
          {!support.ok ? (
            <p className="galley-present-dialog-warn">{support.reason}</p>
          ) : (
            <>
              <Choice
                label="画面"
                value={recOptions.orientation}
                options={[
                  { value: "landscape", label: "横屏 16:9", hint: "B 站、YouTube、西瓜视频" },
                  { value: "portrait", label: "竖屏 9:16", hint: "视频号、抖音、小红书" },
                ]}
                onChange={(orientation) => setRecOptions((o) => ({ ...o, orientation }))}
              />
              <Choice
                label="节奏"
                value={recOptions.pacing}
                options={[
                  { value: "auto", label: "自动播放", hint: "从头播到尾，结束后自动保存" },
                  { value: "manual", label: "我自己翻页", hint: "按方向键往下走，适合边讲边录；按 Esc 结束" },
                ]}
                onChange={(pacing) => setRecOptions((o) => ({ ...o, pacing }))}
              />
              {recOptions.pacing === "auto" && (
                <fieldset className="galley-present-speeds">
                  <legend>速度</legend>
                  {SPEEDS.map((v) => (
                    <button key={v} type="button" aria-pressed={recOptions.speed === v} onClick={() => setRecOptions((o) => ({ ...o, speed: v }))}>
                      {formatSpeed(v)}
                    </button>
                  ))}
                  <span>翻页和动画一起变快或变慢</span>
                </fieldset>
              )}
              <label className="galley-present-check">
                <input type="checkbox" checked={recOptions.captions} onChange={(e) => setRecOptions((o) => ({ ...o, captions: e.target.checked }))} />
                显示字幕（讲稿和每一步的讲解）
              </label>
              <label className="galley-present-check">
                <input type="checkbox" checked={recOptions.mic} onChange={(e) => setRecOptions((o) => ({ ...o, mic: e.target.checked }))} />
                同时录麦克风（用自己的声音讲）
              </label>
              <p className="galley-present-dialog-hint">
                点开始后，浏览器会请你选择要录的画面，选「这个标签页」。
                {support.crop ? "只会录下幻灯片，控制按钮不会录进去。" : "这个浏览器不支持只录一部分，会录下整个标签页。"}
                {support.mp4 ? "录好后保存成 MP4。" : "这个浏览器只能保存成 WebM，上传前可能要转一下格式。"}
                窗口越大，录出来越清楚。
              </p>
            </>
          )}
          {recError && <p className="galley-present-dialog-warn">{recError}</p>}
          <div className="galley-present-dialog-actions">
            <button type="button" onClick={() => setRec("idle")}>
              取消
            </button>
            {support.ok && (
              <button type="button" className="galley-present-primary" onClick={() => void startRecording()}>
                开始录制
              </button>
            )}
          </div>
        </div>
      )}

      {recording_ && (
        <div className="galley-present-recbar" style={{ height: REC_BAR }}>
          {rec === "countdown" ? (
            <span>{countdown > 0 ? `${countdown} 秒后开始录制` : "开始"}</span>
          ) : (
            <>
              <span className="galley-present-recdot" aria-hidden="true" />
              <span>录制中 {formatTime(elapsed)}</span>
              <span className="galley-present-rechint">{recOptions.pacing === "manual" ? "→ 下一步　Esc 结束" : "自动播放中　Esc 提前结束"}</span>
              <button type="button" onClick={() => void stopRecording()}>
                结束并保存
              </button>
            </>
          )}
        </div>
      )}

      {rec === "saving" && (
        <div className="galley-present-dialog" role="status">
          <h2>正在保存……</h2>
        </div>
      )}

      {rec === "done" && result && (
        <div className="galley-present-dialog galley-present-result" role="dialog" aria-label="录制完成">
          <h2>录好了</h2>
          <video src={result.url} controls playsInline />
          <p className="galley-present-dialog-hint">
            已经下载到你的电脑：{result.filename}
            {result.width ? `（${result.width} × ${result.height}）` : ""}。没看到的话点下面的按钮再下载一次。
          </p>
          <div className="galley-present-dialog-actions">
            <button type="button" onClick={() => setRec("idle")}>
              关闭
            </button>
            <button type="button" className="galley-present-primary" onClick={() => download(result.url, result.filename)}>
              再下载一次
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="galley-present-choice">
      <legend>{label}</legend>
      {options.map((o) => (
        <label key={o.value} data-on={o.value === value || undefined}>
          <input type="radio" checked={o.value === value} onChange={() => onChange(o.value)} />
          <b>{o.label}</b>
          <span>{o.hint}</span>
        </label>
      ))}
    </fieldset>
  );
}
