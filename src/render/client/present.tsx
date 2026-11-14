"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { advance, leadsOn, planBuild, type BuildState, type BuildStop } from "../build";
import { captionParts, captionWidth, defaultPageStay, speakingTime } from "../captions";
import { download, prepareRecording, recordingSupport, type Recording, type RecordingSupport } from "./recorder";
import { formatSpeed, PresentSpeed, SPEEDS } from "./speed";
import { printWhenDiagramsReady } from "../print-readiness";
import { turnKind } from "../turn";

/**
 * 演示模式：文章变成全屏的幻灯片。
 *
 * 翻页的规则：按"下一步"时，先看当前这一页里还有没有东西可走（顺序见 render/build.ts）：
 * - 文字一条一条出现：段落、列表的每一项，除了第一条都先藏着，按一下出一条；
 * - 页里的动画（代码演变、算法动画、场景）：给它发一个 "galley-step" 事件，它接了（preventDefault）就算这一步用掉了。
 * 都走完了，才翻到下一页。"上一步"原路退回。
 *
 * 转场：换页时旧的一页退出、新的一页进来，怎么动取决于两页的关系（见 render/turn.ts）：
 * 同一节里往下翻是上下接续，标题缩到左上角变成小字留在原处；换一节是左右推开；封面和结尾是推近拉远。
 * 同一节里相邻两页都有同一类大块（都是代码块、都是图、都是播放器）时，这个大块不跟着整页走，
 * 而是留在画面上从上一页的位置和大小变到这一页的，里面的内容交叉淡入：看起来是同一个窗口换了内容。
 * 用浏览器的视图过渡（View Transitions）做：换页前后各拍一张，中间的动画由 globals.css 里的规则决定。
 * 浏览器不支持、读者设置了减少动态效果、打印时，直接换页。
 *
 * 幻灯片按固定的设计尺寸排版（横屏 1600×900，竖屏 900×1600），整体缩放到窗口大小，
 * 所以在什么屏幕上看、录成视频，排版都一样。内容太多放不下时整页缩小一点。
 *
 * 按声音走：做视频的工具把每一拍配音的时长传进来（timing，名字见 render/narration.ts），
 * 自动播放时这一页、这一步就按那个时长停。一页的讲稿说完，才开始走这一页里的步骤。
 * 演示同时把每一拍实际开始的时刻记下来（window.__galleyTimeline，并通知外层页面），
 * 工具可以按它把声音对到画面上；在这里录的视频，录完可以下载这份时间轴。
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

type StepDetail = { dir: number; wait?: number; caption?: string; beat?: string; anim?: number };
/** 实际走过的时间轴：每一拍（见 render/narration.ts）是什么时候开始的 */
type TimelineEntry = { id: string; at: number };

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void>; ready: Promise<void> } };

/** 一页里能一条一条出现的文字：段落、引文、表格、提示框，以及列表的每一项 */
const BUILD_BLOCKS = "p, blockquote, .galley-table-wrap, .galley-callout";
/** 一页里的"大块"：相邻两页是同一类时，换页时把它们接起来 */
const HERO_BLOCKS = ":scope > figure, :scope > .galley-mermaid, :scope > .galley-chart, :scope > .galley-flow";

const proseOf = (slide: HTMLElement | null | undefined) => slide?.querySelector<HTMLElement>(".galley-slide-body > .galley-prose") ?? null;
const charsOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, "").length;

/** 第一次进这一页时：找出能一条一条出现的文字，除了第一条都先藏起来（藏着的仍然占位，出现时版面不会跳） */
function prepareBuild(slide: HTMLElement) {
  const prose = proseOf(slide);
  if (!prose || prose.dataset.buildReady) return;
  prose.dataset.buildReady = "true";
  const units: HTMLElement[] = [];
  for (const child of Array.from(prose.children) as HTMLElement[]) {
    if (child.tagName === "UL" || child.tagName === "OL") units.push(...(Array.from(child.children) as HTMLElement[]).filter((item) => item.tagName === "LI"));
    else if (child.matches(BUILD_BLOCKS)) units.push(child);
  }
  // 以冒号结尾、而且紧挨着的就是下一条文字（或者一个列表，下一条是它的第一项）时，这一条是引子。
  // 后面跟着的是代码或图时不算：那是在引出它，不是引出再后面的文字。
  const leads = units.map((unit, i) => {
    const next = unit.nextElementSibling;
    return leadsOn(unit.textContent ?? "") && !!units[i + 1] && (next === units[i + 1] || next?.firstElementChild === units[i + 1]);
  });
  planBuild(leads).forEach((plan, i) => {
    units[i].dataset.build = plan.state;
    if (plan.lead) units[i].dataset.buildLead = "true";
  });
}

/** 这一页里能"走一步"的东西，按页面上的先后：藏着等出现的文字，和页里的播放器 */
function buildStops(slide: HTMLElement): BuildStop[] {
  return Array.from(slide.querySelectorAll<HTMLElement>("[data-build], [data-steppable]")).map((el) => {
    if (el.dataset.build) {
      return { type: "unit", state: el.dataset.build as BuildState, lead: !!el.dataset.buildLead, chars: charsOf(el), apply: (state) => void (el.dataset.build = state) };
    }
    return {
      type: "player",
      step: (dir) => {
        const detail: StepDetail = { dir };
        const event = new CustomEvent<StepDetail>("galley-step", { detail, cancelable: true });
        el.dispatchEvent(event);
        return event.defaultPrevented ? detail : null;
      },
    };
  });
}

/** 这一页的文字里，一进来就在的那几条占多大比例（按字数）。没有分步的页返回 0 */
function firstShare(slide: HTMLElement | null): number {
  const units = slide ? Array.from(slide.querySelectorAll<HTMLElement>("[data-build]")) : [];
  const total = units.reduce((sum, unit) => sum + charsOf(unit), 0);
  if (!total) return 0;
  return units.filter((unit) => unit.dataset.build === "first").reduce((sum, unit) => sum + charsOf(unit), 0) / total;
}
type RecState = "idle" | "setup" | "countdown" | "recording" | "saving" | "done";
/**
 * 字幕：off 不显示；on 显示讲稿；space 不显示、但每一页在底部留出字幕的位置。
 * space 是给"字幕由做视频的工具后期加上去"用的：画面本身不带字幕，底部那一条空着，
 * 工具把字幕压上去时不会盖住内容，也不用给视频另加黑边。
 */
export type CaptionMode = "off" | "on" | "space";
type RecOptions = { orientation: Orientation; captions: CaptionMode; mic: boolean; pacing: "auto" | "manual"; speed: number };

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
  orientation: orientationParam,
  captions: captionsParam = "off",
  durations,
  timing,
  print = false,
}: {
  cover: Cover;
  slides: PresentSlide[];
  backHref: string;
  auto?: boolean;
  orientation?: Orientation;
  captions?: CaptionMode;
  /** 每一页至少停留多久（毫秒） */
  durations?: number[];
  /** 每一拍停多久（毫秒）：名字是 p<页码> 或者 <场景的指纹>.<第几步>，见 render/narration.ts */
  timing?: Record<string, number>;
  /** 打印（存成 PDF）：所有页一页接一页排好，打开浏览器的打印对话框 */
  print?: boolean;
}) {
  // 第 0 页是封面，最后一页是结尾
  const total = slides.length + 2;
  const [page, setPage] = useState(0);
  const [auto, setAuto] = useState(autoParam);
  const [orientation, setOrientation] = useState<Orientation>(orientationParam ?? "landscape");
  const [captions, setCaptions] = useState<CaptionMode>(captionsParam);
  const [run, setRun] = useState(0); // 变了就把所有页重新挂载，动画回到开头
  // 自动播放的速度：翻页的停留时间和页里的动画一起按这个速度走（见 speed.ts）
  const [speed, setSpeed] = useState(1);
  const changeSpeed = (dir: number) => setSpeed((v) => SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v) + dir))]);
  const [scale, setScale] = useState(1);
  const [chrome, setChrome] = useState(!autoParam);
  const [showNotes, setShowNotes] = useState(false);
  // 字幕：这一页有讲稿时用讲稿，没有时用页里动画当前这一步的说明
  const [stepCaption, setStepCaption] = useState<{ page: number; text: string; wait?: number } | null>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const size = DESIGN[orientation];

  // ---- 换页和转场 ----
  const pageRef = useRef(0);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const turnToken = useRef(0);
  /** 自动播放时，当前这一页按计划是什么时刻开始的（见自动播放那一段） */
  const planned = useRef<number | null>(null);

  /** 记下一拍开始了，并告诉关心的人：页面上的脚本（事件 galley-beat）、把演示嵌在里面的外层页面（postMessage） */
  const logBeat = useCallback((id: string) => {
    const entry: TimelineEntry = { id, at: Math.round(performance.now()) };
    const w = window as unknown as { __galleyTimeline?: TimelineEntry[] };
    (w.__galleyTimeline ??= []).push(entry);
    window.dispatchEvent(new CustomEvent("galley-beat", { detail: entry }));
    // 只有名字和时刻，没有讲稿的内容
    if (window.parent !== window) window.parent.postMessage({ source: "galley-present", type: "beat", ...entry }, "*");
  }, []);
  useEffect(() => {
    if (!print) logBeat(`p${page}`);
  }, [page, run, print, logBeat]);

  /** 换到第 to 页。animate 为 false 时不放转场（比如录制开始时回到封面） */
  const turnTo = useCallback(
    (to: number, animate = true) => {
      const from = pageRef.current;
      const next = Math.max(0, Math.min(total - 1, to));
      if (next === from) return;
      pageRef.current = next;
      // 离开的这一页：内容的进场动画到此为止；上一次转场接过的大块也放开
      const leaving = slideRefs.current[from];
      if (leaving) delete leaving.dataset.enter;
      document.querySelectorAll("[data-slide-hero]").forEach((el) => el.removeAttribute("data-slide-hero"));
      const doc = document as TransitionDocument;
      // 页面在后台时浏览器不出画面，视图过渡会一直等着：直接换页
      if (!animate || print || !doc.startViewTransition || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPage(next);
        return;
      }
      // 转场的种类和方向写在 <html> 上，样式按它选动画；转场结束后拿掉
      const root = document.documentElement;
      const token = ++turnToken.current;
      const kind = turnKind(slides, from, next);
      root.dataset.slideTurn = kind;
      root.dataset.slideDir = next > from ? "forward" : "back";
      if (kind === "within") {
        // 两页都有同一类大块：标成同一个东西，转场时从上一页的位置变到这一页的
        const a = proseOf(slideRefs.current[from])?.querySelector<HTMLElement>(HERO_BLOCKS);
        const b = proseOf(slideRefs.current[next])?.querySelector<HTMLElement>(HERO_BLOCKS);
        if (a && b && a.classList[0] === b.classList[0]) {
          a.dataset.slideHero = "true";
          b.dataset.slideHero = "true";
        }
      }
      const transition = doc.startViewTransition(() => flushSync(() => setPage(next)));
      const clear = () => {
        // 连着翻页时，上一次转场结束得晚：不要把这一次的标记拿掉
        if (turnToken.current !== token) return;
        delete root.dataset.slideTurn;
        delete root.dataset.slideDir;
      };
      transition.finished.then(clear, clear);
      // 连着翻页时上一次转场会被新的顶掉，浏览器用一个被拒绝的 Promise 通知这件事：这是正常情况，不算出错
      transition.ready.catch(() => {});
    },
    [total, print, slides],
  );

  // ---- 录制 ----
  const [rec, setRec] = useState<RecState>("idle");
  const [recOptions, setRecOptions] = useState<RecOptions>({ orientation: orientationParam ?? "landscape", captions: "space", mic: false, pacing: "auto", speed: 1 });
  const [support, setSupport] = useState<RecordingSupport | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ url: string; filename: string; width: number; height: number; timeline: TimelineEntry[] } | null>(null);
  const recStartedAt = useRef(0);
  const recording = useRef<Recording | null>(null);
  const recStarted = useRef(0);
  const recording_ = rec === "countdown" || rec === "recording";

  // 没有指定画幅时跟随屏幕方向；录制期间保持用户选定的输出尺寸。
  // 只认手机、平板这类触屏设备：电脑上把窗口拉窄不是要竖屏演示，画幅跟着变反而突兀。
  useLayoutEffect(() => {
    if (orientationParam || rec !== "idle" || !window.matchMedia("(pointer: coarse)").matches) return;
    const adapt = () => setOrientation(window.innerHeight > window.innerWidth ? "portrait" : "landscape");
    adapt();
    window.addEventListener("resize", adapt);
    return () => window.removeEventListener("resize", adapt);
  }, [orientationParam, rec]);

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
  // 打印时每一页都要算，平时只算当前这一页。
  useLayoutEffect(() => {
    const targets = print ? slideRefs.current : [slideRefs.current[page]];
    const observers = targets.map((slide) => {
      const el = slide?.querySelector<HTMLElement>(".galley-slide-body");
      if (!slide || !el) return null;
      const fit = () => fitSlide(slide, el);
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      return ro;
    });
    return () => observers.forEach((ro) => ro?.disconnect());
    // 开关字幕会改变页面留给内容的高度，也要重新算
  }, [page, run, orientation, print, captions]);

  // 打印：屏幕上按窗口宽度缩小预览，真正打印时恢复原大（一页 PDF 正好是一页幻灯片）。
  // 打印前后的切换直接改样式：打印对话框弹出之前浏览器就要排版，等 React 重新渲染来不及。
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!print || !stage) return;
    const preview = () => void (stage.style.zoom = String(Math.min(1, (window.innerWidth - 32) / size.w)));
    const actual = () => void (stage.style.zoom = "1");
    preview();
    window.addEventListener("resize", preview);
    window.addEventListener("beforeprint", actual);
    window.addEventListener("afterprint", preview);
    return () => {
      window.removeEventListener("resize", preview);
      window.removeEventListener("beforeprint", actual);
      window.removeEventListener("afterprint", preview);
    };
  }, [print, size.w]);

  // 打印：等待所有 Mermaid 页完成渲染和布局，避免导出的 PDF 留下占位框。
  useEffect(() => {
    const stage = stageRef.current;
    if (!print || !stage) return;
    return printWhenDiagramsReady(stage, document.fonts.ready, () => window.print());
  }, [print]);

  /** 让当前页里的动画走一步；返回它接没接，以及建议等多久再走下一步 */
  /** 这一页至少停留多久（毫秒，已经按速度算过）：给定的时长，否则按讲稿或页面文字估 */
  const pageStay = useCallback(
    (p: number) => {
      const slide = p >= 1 && p <= slides.length ? slides[p - 1] : null;
      const fallback = p >= total - 1 ? 2500 : slide ? defaultPageStay(slide.notes.length, slide.text) : 3500;
      return (timing?.[`p${p}`] ?? durations?.[p] ?? fallback) / speed;
    },
    [timing, durations, slides, speed, total],
  );
  /** 页里的播放器走了一步，这一步停多久：工具给了这一拍的时长就按它（至少等动画放完），否则按播放器自己说的 */
  const stepWait = useCallback(
    (inner: StepDetail) => {
      const given = inner.beat ? timing?.[inner.beat] : undefined;
      return given === undefined ? inner.wait : Math.max(given / speed, inner.anim ?? 0);
    },
    [timing, speed],
  );

  const stepInside = useCallback(
    (dir: number): StepDetail | null => {
      const slide = slideRefs.current[page];
      if (!slide) return null;
      const stops = buildStops(slide);
      const result = advance(stops, dir);
      if (!result) return null;
      if ("player" in result) return { dir, ...result.player };
      // 出现了一条文字：自动播放时，它按自己的字数分摊这一页的时间
      const total = stops.reduce((sum, stop) => sum + (stop.type === "unit" ? stop.chars : 0), 0);
      return { dir, wait: total ? (pageStay(page) * result.chars) / total : undefined };
    },
    [page, pageStay],
  );

  // 进到一页：这一页的内容依次进场；能一条一条出现的文字先藏好。
  // 用 layout effect：要赶在这一页第一次画出来之前（也赶在转场拍"之后"那一张之前）。
  useLayoutEffect(() => {
    if (print) return;
    slideRefs.current.forEach((slide, i) => {
      if (!slide) return;
      if (i === page) slide.dataset.enter = "true";
      else delete slide.dataset.enter;
    });
    const slide = slideRefs.current[page];
    if (slide) prepareBuild(slide);
  }, [page, run, print]);

  const move = useCallback(
    (dir: number) => {
      const inner = stepInside(dir);
      if (inner) {
        if (inner.beat) logBeat(inner.beat);
        if (inner.caption) setStepCaption({ page, text: inner.caption, wait: stepWait(inner) });
        return inner;
      }
      turnTo(page + dir);
      return null;
    },
    [stepInside, turnTo, page, logBeat, stepWait],
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
    // 这段视频里每一拍是第几毫秒开始的：做视频的工具按它把声音对上去
    const all = (window as unknown as { __galleyTimeline?: TimelineEntry[] }).__galleyTimeline ?? [];
    const timeline = all.filter((e) => e.at >= recStartedAt.current).map((e) => ({ id: e.id, at: e.at - recStartedAt.current }));
    setResult({ url, filename, width, height, timeline });
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
      turnTo(0, false);
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
        recStartedAt.current = Math.round(performance.now());
        logBeat("p0");
        setElapsed(0);
        setAuto(recOptions.pacing === "auto");
        setRec("recording");
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [rec, countdown, recOptions.pacing, logBeat]);

  // 录制计时
  useEffect(() => {
    if (rec !== "recording") return;
    const t = setInterval(() => setElapsed(Date.now() - recStarted.current), 500);
    return () => clearInterval(t);
  }, [rec]);

  // 放大图表时暂停自动翻页，让读者能停下来查看细节。
  useEffect(() => {
    const pause = () => setAuto(false);
    window.addEventListener("galley-diagram-open", pause);
    return () => window.removeEventListener("galley-diagram-open", pause);
  }, []);

  // 键盘（打印模式下不翻页）
  useEffect(() => {
    if (print) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector(".galley-diagram-dialog[open]")) return;
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
        else if (e.key === "Home") turnTo(0);
        else if (e.key === "End") turnTo(total - 1);
        else if (e.key === "f" || e.key === "F") {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.();
        } else if (e.key === "n" || e.key === "N") setShowNotes((v) => !v);
        else if (e.key === "c" || e.key === "C") setCaptions((v) => (v === "on" ? "off" : "on"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auto, move, turnTo, total, backHref, rec, stopRecording, print]);

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
      }, pageStay(page));
      return () => clearTimeout(t);
    }
    const reading = pageStay(page);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    // 按计划的时刻排，不按"上一下实际发生的时刻"排：定时器每次都会晚一点点，一拍一拍累加起来，
    // 长视频到后面画面就比声音慢了。at 是下一件事按计划该发生的时刻；这一页按计划的开始时刻接着上一页的结束时刻
    // （差得太多说明中间暂停过、手动翻过页，就从现在重新算）。
    const now = performance.now();
    const pageStart = planned.current !== null && Math.abs(planned.current - now) < 250 ? planned.current : now;
    let at = pageStart;
    const after = (ms: number, fn: () => void) => {
      at += ms;
      timer = setTimeout(fn, Math.max(0, at - performance.now()));
    };
    const tick = () => {
      if (cancelled) return;
      const inner = stepInside(1);
      if (inner) {
        const wait = stepWait(inner);
        if (inner.beat) logBeat(inner.beat);
        if (inner.caption) setStepCaption({ page, text: inner.caption, wait });
        // 页里动画给的等待时间已经按速度算过了（它们也在用同一个速度）
        after(wait ?? 600, tick);
        return;
      }
      // 页里的东西都走完了：这一页还没停够就等够，然后翻页
      const left = pageStart + reading - at;
      if (left > 1) after(left, tick);
      else {
        planned.current = at;
        turnTo(page + 1);
      }
    };
    // 先让这一页显示出来、动画开始，再开始往下走。
    // 文字一条一条出现的页：一进来就在的那几条，先留出它们那一份时间。
    // 工具给了这一页的时长（这一页讲稿的配音有多长）：先把这一页的话说完，再走页里的步骤
    const share = firstShare(slideRefs.current[page]);
    const lead = share > 0 ? reading * share : timing?.[`p${page}`] !== undefined ? reading : 0;
    after(Math.max(1200 / speed, lead), tick);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auto, autoParam, speed, page, total, stepInside, turnTo, pageStay, stepWait, logBeat, timing, rec, stopRecording]);

  // 结果里的视频地址用完就释放
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);

  const current = page >= 1 && page <= slides.length ? slides[page - 1] : null;
  const caption = current ? current.notes || (stepCaption?.page === page ? stepCaption.text : null) : null;
  // 这句字幕大概会在屏幕上停多久：几段字幕按各自的长短分摊这段时间
  const captionSpan = !caption ? 0 : current?.notes ? (durations?.[page] ?? speakingTime(caption)) / speed : (stepCaption?.wait ?? speakingTime(caption) / speed);
  const idle = rec === "idle";

  return (
    <div
      className="galley-present"
      data-orientation={orientation}
      data-captions={captions === "off" ? undefined : captions}
      data-chrome={chrome || undefined}
      data-recording={recording_ || undefined}
      data-print={print || undefined}
      style={print ? ({ "--slide-w": `${size.w}px`, "--slide-h": `${size.h}px` } as CSSProperties) : undefined}
      onClick={(e) => idle && !auto && e.target === e.currentTarget && move(1)}
    >
      <div
        ref={stageRef}
        className="galley-present-stage"
        style={
          (print
            ? { width: size.w }
            : { width: size.w, height: size.h, top: recording_ ? `calc(50% - ${REC_BAR / 2}px)` : "50%", transform: `translate(-50%, -50%) scale(${scale})` }) as CSSProperties
        }
      >
        <PresentSpeed.Provider value={speed}>
        <div key={run} className="galley-present-slides">
          <section ref={(el) => void (slideRefs.current[0] = el)} className="galley-slide galley-slide-cover" data-current={page === 0 || undefined} hidden={!print && page !== 0}>
            <p className="galley-slide-site">{cover.site}</p>
            <h1>{cover.title}</h1>
            {cover.summary && <p className="galley-slide-summary">{cover.summary}</p>}
            {cover.date && <p className="galley-slide-date">{cover.date}</p>}
          </section>
          {slides.map((s, i) => (
            <section key={i} ref={(el) => void (slideRefs.current[i + 1] = el)} className="galley-slide" data-current={page === i + 1 || undefined} hidden={!print && page !== i + 1}>
              <div className="galley-slide-body galley-prose">
                {s.section && <p className="galley-slide-section">{s.section}</p>}
                {s.content}
              </div>
            </section>
          ))}
          <section ref={(el) => void (slideRefs.current[total - 1] = el)} className="galley-slide galley-slide-cover" data-current={page === total - 1 || undefined} hidden={!print && page !== total - 1}>
            <h1>{cover.title}</h1>
            <p className="galley-slide-site">{cover.site}</p>
            {cover.url && <p className="galley-slide-date">{cover.url.replace(/^https?:\/\//, "")}</p>}
          </section>
        </div>
        </PresentSpeed.Provider>
        {captions === "on" && caption && <Caption key={`${page}:${caption}`} text={caption} span={captionSpan} />}
      </div>

      {print && (
        <>
          {/* 纸张大小跟着幻灯片走：一页 PDF 就是一页幻灯片 */}
          <style>{`@page { size: ${size.w}px ${size.h}px; margin: 0; }`}</style>
          <p className="galley-present-print-hint">
            打印对话框里选「存储为 PDF」，边距选「无」，勾上「背景图形」。没有弹出的话按 ⌘P 或 Ctrl+P。<a href={backHref}>返回</a>
          </p>
        </>
      )}

      {idle && !autoParam && !print && (
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
            <button type="button" onClick={() => setCaptions((v) => (v === "on" ? "off" : "on"))} aria-pressed={captions === "on"} title="把讲稿显示成字幕（C）">
              字幕
            </button>
            <button
              type="button"
              onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.())}
              title="全屏（F）"
            >
              全屏
            </button>
            {/* 存成 PDF：换成打印模式（网址加上 print=1），所有页排好后打开打印对话框 */}
            <a href={`?print=1&orientation=${orientation}`} title="存成 PDF（每页一张幻灯片）">
              PDF
            </a>
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
              {/* 这一页的讲稿；没有时显示页里动画当前这一步的讲稿（场景动画的 say） */}
              <p>{current ? current.notes || (stepCaption?.page === page ? stepCaption.text : "") || "这一页没有讲稿。" : ""}</p>
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
              <Choice
                label="字幕"
                value={recOptions.captions}
                options={[
                  { value: "space", label: "留出位置", hint: "画面不带字幕，底部空出一条，后期用工具加" },
                  { value: "on", label: "直接显示", hint: "把讲稿录进画面里" },
                  { value: "off", label: "不要", hint: "内容用满整个画面" },
                ]}
                onChange={(captions) => setRecOptions((o) => ({ ...o, captions }))}
              />
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
            {/* 每一拍在这段视频里是第几毫秒开始的：后期配音、加字幕时按它对齐 */}
            <button
              type="button"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([JSON.stringify({ video: result.filename, beats: result.timeline }, null, 2)], { type: "application/json" }));
                download(url, result.filename.replace(/\.[a-z0-9]+$/, "") + ".timeline.json");
                URL.revokeObjectURL(url);
              }}
            >
              下载时间轴
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

/**
 * 字幕：一次只显示一小段（见 render/captions.ts），几段依次出现。
 * 整句讲稿一起放上去会排成两三行的一大块，压住上面的画面。
 */
function Caption({ text, span }: { text: string; span: number }) {
  const parts = useMemo(() => captionParts(text), [text]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (index >= parts.length - 1) return;
    const total = parts.reduce((sum, part) => sum + captionWidth(part), 0) || 1;
    const timer = setTimeout(() => setIndex(index + 1), Math.max(700, (span * captionWidth(parts[index])) / total));
    return () => clearTimeout(timer);
  }, [index, parts, span]);
  return (
    <p key={index} className="galley-present-caption">
      {parts[Math.min(index, parts.length - 1)]}
    </p>
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

/** 一页内容放不下时整页等比缩小，见上面用到它的地方。 */
function fitSlide(slide: HTMLElement, el: HTMLElement) {
  const style = getComputedStyle(slide);
  const available = slide.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const natural = el.offsetHeight;
  const f = natural > available ? Math.max(0.5, available / natural) : 1;
  el.style.transform = f < 1 ? `scale(${f})` : "";
  el.style.marginBottom = f < 1 ? `${-natural * (1 - f)}px` : "";
  // 缩到最小还放不下时从顶部开始排，至少标题和开头不会被裁掉
  if (natural * f > available + 1) slide.dataset.overflow = "true";
  else delete slide.dataset.overflow;
}
