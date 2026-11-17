import { readImmersiveScene3D } from "./scene3d-source";
import { scene3dKey } from "@/core/scene3d/shared";
import type { Scene3D, Scene3DResult } from "@/core/scene3d/schema";
import { visit } from "unist-util-visit";
import { parseToTree } from "@/core/markup/parse";
import { readScene3D, readScene } from "@/core/markup/structure";
import { plainText } from "@/core/markup/text";
import { readingTime } from "@/core/scene/frame";
import { sceneKey } from "@/core/scene/shared";
import type { SceneResult } from "@/core/scene/types";
import { defaultPageStay } from "./pacing";
import { splitSlides } from "./slides";
import { fingerprint, proseGuideTargets, sceneGuideTargets } from "./guide-targets";
import type { GuideTarget, StructureBeat } from "../contract/narration";

/**
 * 一篇文章做成视频时的"拍"：演示按顺序走过的每一段。博客只给画面这一边（结构），讲稿由视频工坊逐拍写。
 *
 * 视频工坊拿着这份清单（structure.json）写讲稿、配音，得到每一拍的时长，再把时长传回演示页
 * （网址参数 timing，见 app/posts/[slug]/present/page.tsx），演示就按声音的长短走。
 *
 * 一拍是什么：
 * - 封面、结尾各一拍；
 * - 每一页一拍；
 * - 场景动画的每一步一拍。
 * 顺序就是播放的顺序：先是这一页，再是这一页里场景的每一步。
 */
const MIN_PAGE_MS = 1200;
/** 封面和结尾只停一秒：标题一闪就进正文，视频不拖沓 */
const TITLE_PAGE_MS = 1000;
const SELF_PACED = new Set(["code-steps", "algo", "race", "trace"]);

type Directive = { type: string; name?: string };

/** 同一组里内容相同的，按出现顺序加 -2、-3 */
function numbered() {
  const seen = new Map<string, number>();
  return (key: string) => {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count > 1 ? `${key}-${count}` : key;
  };
}

/** 给场景元素加锚点：所在场景的锚点，加上元素的文字（含类型）；文字相同的按顺序编号 */
function anchorSceneTargets(targets: GuideTarget[], scene: string): GuideTarget[] {
  const name = numbered();
  return targets.map((target) => ({ ...target, anchor: `${scene}/${name(fingerprint(target.label))}` }));
}

/**
 * 每一拍除了 id，还有按内容算的锚点（工坊同步时用，见 contract/narration.ts）：
 * - 页：所属的二级、三级标题，加上同一标题下的第几页。小节标题不改，页就对得上；
 * - 场景：页的锚点加上它是这一页里的第几个场景；
 * - 步骤：场景的锚点加上画面上那句话的指纹；那句话改了，按 fallback（第几步）兜底；
 * - 正文元素：页的锚点加上这段源文的指纹；场景元素：场景的锚点加上元素的文字。
 */
export function presentationBeats(body: string, scenes: Record<string, SceneResult>, scenes3d: Record<string, Scene3DResult> = {}): StructureBeat[] {
  const immersive = readImmersiveScene3D(body, scenes3d);
  if (immersive) return scene3dBeats(immersive.id, immersive.scene, 1, "scene3d");
  const beats: StructureBeat[] = [{ id: "p0", anchor: "cover", kind: "cover", page: 0, title: null, section: null, suggestedMs: TITLE_PAGE_MS, minMs: TITLE_PAGE_MS, targets: [{ id: "p0:title", label: "封面标题", anchor: "cover/title" }] }];
  const slides = splitSlides(body);
  const pageName = numbered();
  slides.forEach((slide, i) => {
    const page = i + 1;
    const title = slide.title ?? null;
    const section = slide.section ?? null;
    const pageAnchor = `page:${pageName(fingerprint(`${section ?? ""}\n${title ?? ""}`))}`;
    const steps: StructureBeat[] = [];
    const tree = parseToTree(slide.source);
    const targets: GuideTarget[] = proseGuideTargets(tree, page, slide.source).map(({ target }) => ({ ...target, anchor: `${pageAnchor}/${target.id.slice(target.id.indexOf(":") + 1)}` }));
    let selfPaced = false;
    let sceneIndex = 0;
    visit(tree, (node) => {
      const d = node as Directive;
      if (d.type !== "containerDirective" && d.type !== "leafDirective") return;
      if (SELF_PACED.has(d.name ?? "")) selfPaced = true;
      if (d.name === "scene3d") {
        const sc = readScene3D(node as never), key = scene3dKey(sc.code ?? ""), result = scenes3d[key];
        if (result?.ok) steps.push(...scene3dBeats(key, result.scene, page, `${pageAnchor}/scene3d${++sceneIndex}`));
      }
      if (d.name !== "scene") return;
      const sc = readScene(node as never);
      if (sc.code === undefined) return;
      const sceneAnchor = `${pageAnchor}/scene${++sceneIndex}`;
      const key = sceneKey(sc.code, sc.ratio);
      const result = scenes[key];
      if (!result?.ok) return;
      targets.push(...anchorSceneTargets(sceneGuideTargets(result.scene, key, -1), sceneAnchor));
      const stepName = numbered();
      result.scene.steps.forEach((step, k) => {
        steps.push({
          id: `${key}.${k}`,
          anchor: `${sceneAnchor}/step:${stepName(fingerprint(step.text))}`,
          fallback: `${sceneAnchor}/#${k}`,
          kind: "step",
          page,
          title,
          section,
          written: step.text,
          targets: anchorSceneTargets(sceneGuideTargets(result.scene, key, k), sceneAnchor),
          // 和播放器自己的算法一致：动画放完再留出读那句文字的时间
          suggestedMs: Math.round(step.duration + readingTime(step.text)),
          minMs: step.duration,
        });
      });
    });
    const textChars = plainText(slide.source).replace(/\s+/g, "").length;
    beats.push({
      id: `p${page}`,
      anchor: pageAnchor,
      kind: "page",
      page,
      title,
      section,
      targets,
      // 页里有步骤：这一页本身只是亮个相，马上开始走步骤；纯文字的页：按文字估
      suggestedMs: Math.round(steps.length || selfPaced ? MIN_PAGE_MS : defaultPageStay(textChars)),
      minMs: MIN_PAGE_MS,
      ...(selfPaced ? { selfPaced: true as const } : {}),
    });
    beats.push(...steps);
  });
  beats.push({ id: `p${slides.length + 1}`, anchor: "ending", kind: "ending", page: slides.length + 1, title: null, section: null, suggestedMs: TITLE_PAGE_MS, minMs: TITLE_PAGE_MS, targets: [{ id: `p${slides.length + 1}:title`, label: "结尾标题", anchor: "ending/title" }] });
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

function scene3dBeats(id: string, scene: Scene3D, page: number, anchor: string): StructureBeat[] {
  return scene.shots.map((shot, i) => ({id:`${id}.${i}`,anchor:`${anchor}/${shot.id}`,kind:"step",page,title:shot.title,section:null,written:shot.text,suggestedMs:shot.duration,minMs:shot.duration,targets:[]}));
}
