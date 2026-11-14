import type { Beat } from "../core/studio-types";
import { visit } from "unist-util-visit";
import { parseToTree } from "@/core/markup/parse";
import { readScene } from "@/core/markup/structure";
import { plainText } from "@/core/markup/text";
import { readingTime } from "@/core/scene/frame";
import { sceneKey } from "@/core/scene/shared";
import type { SceneResult } from "@/core/scene/types";
import { defaultPageStay, speakingTime } from "./captions";
import { splitSlides } from "./slides";
import { proseGuideTargets, sceneGuideTargets } from "./guide-targets";

/**
 * 一篇文章做成视频时的"拍"：演示按顺序走过的每一段，以及这一段要说的话。
 *
 * 做视频的工具拿着这份清单：给每一拍的讲稿配音，得到每一拍的时长，再把时长传回演示页
 * （网址参数 timing，见 app/posts/[slug]/present/page.tsx），演示就按声音的长短走。
 *
 * 一拍是什么：
 * - 封面、结尾各一拍；
 * - 每一页一拍，讲稿是这一页的 :::notes；
 * - 场景动画的每一步一拍，讲稿是这一步的 say。
 * 顺序就是播放的顺序：先是这一页（讲稿说完），再是这一页里场景的每一步。
 *
 * 讲稿不是公开的内容（见 slides.ts 的 publicSlideSource），所以这份清单只给站长和接入的 Agent 读。
 */


const MIN_PAGE_MS = 1200;
const SELF_PACED = new Set(["code-steps", "algo", "race", "trace"]);

type Directive = { type: string; name?: string };

export function narrationBeats(body: string, scenes: Record<string, SceneResult>): Beat[] {
  const beats: Beat[] = [{ id: "p0", kind: "cover", page: 0, title: null, section: null, text: "", suggestedMs: 3500, minMs: MIN_PAGE_MS, targets: [{ id: "p0:title", label: "封面标题" }] }];
  const slides = splitSlides(body);
  slides.forEach((slide, i) => {
    const page = i + 1;
    const title = slide.title ?? null;
    const section = slide.section ?? null;
    const steps: Beat[] = [];
    const tree = parseToTree(slide.source);
    const targets = proseGuideTargets(tree, page).map(({ target }) => target);
    let selfPaced = false;
    visit(tree, (node) => {
      const d = node as Directive;
      if (d.type !== "containerDirective" && d.type !== "leafDirective") return;
      if (SELF_PACED.has(d.name ?? "")) selfPaced = true;
      if (d.name !== "scene") return;
      const sc = readScene(node as never);
      if (sc.code === undefined) return;
      const key = sceneKey(sc.code, sc.ratio);
      const result = scenes[key];
      if (!result?.ok) return;
      targets.push(...sceneGuideTargets(result.scene, key, -1));
      result.scene.steps.forEach((step, k) => {
        steps.push({
          id: `${key}.${k}`,
          kind: "step",
          page,
          title,
          section,
          text: step.say ?? "",
          written: step.text,
          targets: sceneGuideTargets(result.scene, key, k),
          // 和播放器自己的算法一致：有讲稿时等动画放完、话说完；没有讲稿时动画放完再留出读那句文字的时间
          suggestedMs: Math.round(step.say ? Math.max(step.duration, speakingTime(step.say)) + 500 : step.duration + readingTime(step.text)),
          minMs: step.duration,
        });
      });
    });
    const textChars = plainText(slide.source).replace(/\s+/g, "").length;
    const notesChars = slide.notes.replace(/\s+/g, "").length;
    beats.push({
      id: `p${page}`,
      kind: "page",
      page,
      title,
      section,
      text: slide.notes,
      targets,
      // 有讲稿：按讲稿估；没有讲稿但页里有步骤：这一页本身只是亮个相，马上开始走步骤；纯文字的页：按文字估
      suggestedMs: Math.round(notesChars ? defaultPageStay(notesChars, 0) : steps.length || selfPaced ? MIN_PAGE_MS : defaultPageStay(0, textChars)),
      minMs: MIN_PAGE_MS,
      ...(selfPaced ? { selfPaced: true as const } : {}),
    });
    beats.push(...steps);
  });
  beats.push({ id: `p${slides.length + 1}`, kind: "ending", page: slides.length + 1, title: null, section: null, text: "", suggestedMs: 2500, minMs: MIN_PAGE_MS, targets: [{ id: `p${slides.length + 1}:title`, label: "结尾标题" }] });
  return beats;
}

/** 网址参数 timing 的写法：p1:5200,p2:3000,1x9abc.0:4100（名字:毫秒，逗号隔开） */
export function parseTiming(text: string | undefined): Record<string, number> | undefined {
  if (!text) return undefined;
  const out: Record<string, number> = {};
  for (const item of text.split(",").slice(0, 600)) {
    const at = item.lastIndexOf(":");
    const id = item.slice(0, at).trim();
    const ms = Number(item.slice(at + 1));
    if (at > 0 && /^[a-z0-9.]{1,40}$/.test(id) && Number.isFinite(ms) && ms >= 0 && ms <= 600_000) out[id] = ms;
  }
  return Object.keys(out).length ? out : undefined;
}
