import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import type { Beat, Voice } from "../../src/core/studio-types";
import { resolveGuidePlan } from "../../src/core/studio-guides";
import type { GuideReport } from "../../src/render/client/guide-focus";
import { beatLength } from "./timing.js";
import type { ExportProgress } from "../../src/core/studio-exports";

export type TimelineEntry = { id: string; at: number };
export type ExportInput = {
  url: string;
  beats: Beat[];
  voices: Voice[];
  audioPath: (id: string) => string;
  output: string;
  signal: AbortSignal;
  progress: (progress: ExportProgress) => void;
};

const FPS = 30;
const WIDTH = 3840;
const HEIGHT = 2160;
// 失去结束信号时明确失败，不能无限写磁盘。
const MAX_FRAMES = FPS * 60 * 60;

function encode(args: string[], signal: AbortSignal) {
  if (!ffmpegPath) throw new Error("当前系统没有可用的 FFmpeg。");
  const child = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "pipe" });
  let error = "";
  child.stderr.on("data", (chunk: Buffer) => { error = (error + chunk.toString()).slice(-8000); });
  // 管道写入的错误由每一帧的回调处理，同时防止进程提前退出时产生未处理事件。
  child.stdin.on("error", () => {});
  const abort = () => child.kill("SIGKILL");
  signal.addEventListener("abort", abort, { once: true });
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(signal.reason);
      else if (code === 0) resolve();
      else reject(new Error(`视频编码失败：${error || `FFmpeg 退出码 ${code}`}`));
    });
  });
  // 渲染仍在进行时也可能退出；保留原 Promise 的失败供主流程 await。
  void done.catch(() => {});
  if (signal.aborted) abort();
  return { child, done };
}

export function subtitleFile(timeline: TimelineEntry[], voices: Voice[]): string {
  const clock = (ms: number) => {
    const value = Math.round(ms);
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");
    return `${pad(Math.floor(value / 3600000))}:${pad(Math.floor(value / 60000) % 60)}:${pad(Math.floor(value / 1000) % 60)},${pad(value % 1000, 3)}`;
  };
  let index = 0;
  return timeline.flatMap((entry) => (voices.find((v) => v.id === entry.id)?.cues ?? []).map((cue) =>
    `${++index}\n${clock(entry.at + cue.start * 1000)} --> ${clock(entry.at + cue.end * 1000)}\n${cue.text}\n`,
  )).join("\n");
}

export function assertTimeline(beats: Pick<Beat, "id">[], timeline: TimelineEntry[]) {
  if (timeline.length !== beats.length || timeline.some((entry, i) => entry.id !== beats[i].id || entry.at < 0 || (i > 0 && entry.at <= timeline[i - 1].at))) {
    throw new Error("演示时间轴与讲稿不一致，请重新读取文章后导出。");
  }
}

/** 本机逐帧渲染：JS 时钟、CSS 动画、字幕共享同一个时间；屏幕尺寸和机器快慢都不参与计时。 */
export async function exportVideo(input: ExportInput): Promise<{ frames: number; durationMs: number; timeline: TimelineEntry[] }> {
  const { signal } = input;
  signal.throwIfAborted();
  const estimatedMs = input.beats.reduce((sum, beat) => sum + beatLength(beat, input.voices.find((v) => v.id === beat.id)), 0);
  input.progress({ phase: "preparing", frames: 0, timeMs: 0, estimatedMs });
  await mkdir(path.dirname(input.output), { recursive: true });
  const temp = await mkdtemp(path.join(path.dirname(input.output), ".render-"));
  let encoder: ChildProcessWithoutNullStreams | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const abort = () => { void browser?.close(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    browser = await chromium.launch({ headless: true });
    signal.throwIfAborted();
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    // 开发模式先完成编译握手，资源就绪后冻结热更新；关闭连接会触发 Next 重连和刷新。
    let frozen = false;
    await page.routeWebSocket(/\/_next\/hmr(?:\?|$)/, (socket) => {
      const server = socket.connectToServer();
      server.onMessage((message) => { if (!frozen) socket.send(message); });
    });
    let pageError: string | undefined;
    page.on("pageerror", (error) => { pageError = error.message; });
    // 在页面脚本之前安装，所有定时器和 requestAnimationFrame 都受控。
    await page.clock.install();
    const url = new URL(input.url);
    url.searchParams.set("controlled", "1");
    url.searchParams.set("offline", "1");
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("captions", "space");
    url.searchParams.set("timing", input.beats.map((b) => `${b.id}:${beatLength(b, input.voices.find((v) => v.id === b.id))}`).join(","));
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!response?.ok()) throw new Error(`演示页面读取失败：${response?.status()}`);
    await page.waitForSelector(".galley-present-stage[data-ready]", { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector(".galley-mermaid:not([data-ready]):not([data-error])"));
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const image of document.images) image.loading = "eager";
      await Promise.race([
        Promise.all(Array.from(document.images).map((image) => image.decode())),
        new Promise((_, reject) => setTimeout(() => reject(new Error("文章图片未能在 30 秒内加载完成。")), 30000)),
      ]);
      if (document.querySelector(".galley-mermaid[data-error]")) throw new Error("文章里有未能渲染的图表。");
    });
    frozen = true;
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));

    // CSS/WAAPI 的时钟独立于 JS。每次输出帧时暂停并定位它们，避免慢机器漏掉进场动画。
    const renderer = await page.evaluateHandle((voices) => {
      const w = window as unknown as { __galleyTimeline?: TimelineEntry[]; __galleyPresentDone?: boolean };
      w.__galleyTimeline = [];
      w.__galleyPresentDone = false;
      const origin = performance.now();
      const animations = new Map<Animation, number>();
      const stage = document.querySelector<HTMLElement>(".galley-present-stage")!;
      const subtitle = document.createElement("p");
      subtitle.className = "galley-present-caption";
      subtitle.style.animation = "none";
      subtitle.hidden = true;
      stage.append(subtitle);
      let dirty = true;
      new MutationObserver(() => { dirty = true; }).observe(stage, { subtree: true, attributes: true, childList: true, characterData: true });
      // 已经排好的封面从第一帧完整显示。后续新动画从受控时间的零点开始。
      for (const animation of stage.getAnimations({ subtree: true })) {
        if (Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) animation.finish();
        else animation.cancel();
      }
      return {
        frame() {
          const now = performance.now() - origin;
          let moving = false;
          for (const animation of stage.getAnimations({ subtree: true })) {
            if (animation.playState === "finished") continue;
            if (!animations.has(animation)) animations.set(animation, now);
            const elapsed = now - animations.get(animation)!;
            const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
            animation.pause();
            animation.currentTime = Math.min(elapsed, end);
            if (elapsed >= end && Number.isFinite(end)) animation.finish();
            moving = true;
          }
          const timeline = (w.__galleyTimeline ?? []).map((entry) => ({ id: entry.id, at: Math.round(entry.at - origin) }));
          const last = timeline.at(-1);
          const voice = voices.find((v) => v.id === last?.id);
          const t = last ? (now - last.at) / 1000 : 0;
          const text = voice?.cues.find((cue) => t >= cue.start && t < cue.end)?.text ?? "";
          if (subtitle.textContent !== text) { subtitle.textContent = text; subtitle.hidden = !text; dirty = true; }
          const capture = dirty || moving;
          dirty = false;
          return { capture, timeline, done: !!w.__galleyPresentDone };
        },
      };
    }, input.voices);
    const guides = resolveGuidePlan(input.beats, input.voices);
    await page.evaluate((plan) => window.dispatchEvent(new MessageEvent("message", { source: window, data: { source: "galley-studio", type: "guides", plan } })), guides);
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { source: window, data: { source: "galley-studio", type: "start" } })));
    const cdp = await page.context().newCDPSession(page);
    const video = path.join(temp, "video.mp4");
    const encoding = encode([
      "-f", "image2pipe", "-framerate", String(FPS), "-i", "pipe:0", "-an",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-threads", "4", "-pix_fmt", "yuv420p",
      "-vf", "scale=out_color_matrix=bt709", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      "-profile:v", "high", "-level:v", "5.1", "-tag:v", "avc1", video,
    ], signal);
    encoder = encoding.child;
    let frames = 0;
    let previousTime = 0;
    let buffer: Buffer | undefined;
    let timeline: TimelineEntry[] = [];
    for (; frames < MAX_FRAMES; frames++) {
      signal.throwIfAborted();
      if (pageError) throw new Error(`画面渲染失败：${pageError}`);
      const time = Math.round(frames * 1000 / FPS);
      if (frames) await page.clock.runFor(time - previousTime);
      previousTime = time;
      const state = await renderer.evaluate((render) => render.frame());
      timeline = state.timeline;
      if (state.done) break;
      if (state.capture || !buffer) {
        const shot = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
        buffer = Buffer.from(shot.data, "base64");
      }
      await new Promise<void>((resolve, reject) => encoder!.stdin.write(buffer!, (error) => error ? reject(error) : resolve()));
      if (frames % FPS === 0) input.progress({ phase: "rendering", frames, timeMs: time, estimatedMs });
    }
    if (frames === MAX_FRAMES) throw new Error("演示超过一小时仍未结束，导出已停止。");
    assertTimeline(input.beats, timeline);
    const seen = await page.evaluate(() => (window as Window & { __galleyGuideReport?: GuideReport }).__galleyGuideReport?.seen ?? []);
    const missing = guides.flatMap((beat) => beat.cues.map((cue, i) => ({ key: `${beat.id}/${i}`, target: cue.targetId }))).filter((cue) => !seen.includes(cue.key));
    if (missing.length) throw new Error(`讲解指向没有出现在画面中：${missing.map((cue) => cue.target).join("、")}。请检查目标与讲稿时机。`);
    encoder.stdin.end();
    await encoding.done;
    encoder = undefined;
    await browser.close();
    browser = undefined;
    const durationMs = frames * 1000 / FPS;
    input.progress({ phase: "encoding", frames, timeMs: durationMs, estimatedMs });
    // 按画面实际推进的拍点放置原始 WAV；自走节奏的播放器也不会使后续声音和字幕偏移。
    const voiced = timeline.flatMap((entry) => input.voices.some((v) => v.id === entry.id) ? [entry] : []);
    const muxArgs = ["-i", video];
    for (const entry of voiced) muxArgs.push("-i", input.audioPath(entry.id));
    if (voiced.length) {
      const filters = voiced.map((entry, i) => `[${i + 1}:a]adelay=${Math.max(0, entry.at)}:all=1[a${i}]`);
      filters.push(`${voiced.map((_, i) => `[a${i}]`).join("")}amix=inputs=${voiced.length}:normalize=0,apad[a]`);
      muxArgs.push("-filter_complex", filters.join(";"), "-map", "0:v:0", "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000");
    }
    const finished = path.join(temp, "finished.mp4");
    muxArgs.push("-c:v", "copy", "-t", String(durationMs / 1000), "-movflags", "+faststart", finished);
    const muxing = encode(muxArgs, signal);
    encoder = muxing.child;
    encoder.stdin.end();
    await muxing.done;
    encoder = undefined;
    signal.throwIfAborted();
    await writeFile(input.output.replace(/\.mp4$/, ".srt"), subtitleFile(timeline, input.voices));
    await writeFile(input.output.replace(/\.mp4$/, ".timeline.json"), JSON.stringify({ width: WIDTH, height: HEIGHT, fps: FPS, frames, durationMs, timeline }, null, 2));
    await rename(finished, input.output);
    return { frames, durationMs, timeline };
  } finally {
    signal.removeEventListener("abort", abort);
    encoder?.kill("SIGKILL");
    await browser?.close();
    await rm(temp, { recursive: true, force: true });
  }
}
