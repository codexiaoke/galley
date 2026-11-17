import { toString } from "mdast-util-to-string";
import { parseToTree } from "@/core/markup/parse";
import { removeNarration } from "@/core/markup/narration";

/**
 * 把一篇文章切成幻灯片：
 * - 每个二级标题开始新的一页；
 * - 二级标题下面的三级标题也各自成一页（一个小节一页，内容才放得下），
 *   页面上方用小字标出它属于哪个二级标题；二级标题下面直接就是小节时，不单独留一页空的；
 * - 单独一行的 --- 也分页；
 * - 二级标题前面的开场白单独成一页；
 * - :::article 里的内容只属于文章，不进幻灯片；
 * - 演示以图形为主：一节里有图形（场景、图、表、代码、组件、单独成段的图片、公式）时，
 *   普通段落、列表、引用留在文章里，演示页只放图形；要在演示里也显示的文字包进 :::present。
 *   一节里没有任何图形时照旧显示文字，不会剩下一张只有标题的页。
 * 讲稿归视频工坊：历史版本里还留着的 :::notes 和场景里的 say() 先摘掉（core/markup/narration.ts）
 * （演讲者视图里显示，导出视频时当成字幕的内容）。
 */
export type Slide = { title?: string; section?: string; source: string };

type Node = { type: string; depth?: number; name?: string; lang?: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: Node[] };

export function splitSlides(source: string): Slide[] {
  const body = removeNarration(source).body;
  const tree = parseToTree(body) as unknown as Node;
  const top = tree.children ?? [];
  type Draft = { title?: string; section?: string; parts: Node[]; headingOnly?: boolean };
  const slides: Draft[] = [];
  let current: Draft = { parts: [] };
  let section: string | undefined;
  const flush = () => {
    // 只有一个二级标题、下面紧接着就是小节的，不留空页
    if (current.parts.length && !(current.headingOnly && current.parts.length === 1)) slides.push(current);
  };
  for (const node of top) {
    // :::article 只在文章里出现，演示和视频里整段跳过
    if (node.type === "containerDirective" && node.name === "article") continue;
    if (node.type === "thematicBreak") {
      flush();
      current = { section, parts: [] };
      continue;
    }
    if (node.type === "heading" && node.depth === 2) {
      flush();
      section = toString(node as never);
      current = { title: section, parts: [node], headingOnly: true };
      continue;
    }
    if (node.type === "heading" && node.depth === 3) {
      flush();
      current = { title: toString(node as never), section, parts: [node] };
      continue;
    }
    if (current.headingOnly) current.headingOnly = false;
    current.parts.push(node);
  }
  flush();

  // 有图形的小节，演示里只放图形和标了 :::present 的文字
  const graphic = slides.map(graphicsFirst);
  // 一页里有好几个大块（代码演变、算法动画、图、表格……）时，一个大块一页
  const pages = graphic.flatMap((d) => splitHeavy(d, body)).flatMap(splitSolo);

  const slice = (n: Node) => body.slice(n.position?.start.offset ?? 0, n.position?.end.offset ?? 0);
  return pages.map((s) => ({ title: s.title, section: s.title === s.section ? undefined : s.section, source: s.parts.map(slice).join("\n\n") }));
}

/** 占地方的东西：组件、代码块、表格、整块嵌入。提示框不算。 */
function isHeavy(n: Node): boolean {
  if (n.type === "code" || n.type === "table") return true;
  if (n.type === "containerDirective") return n.name !== "callout" && n.name !== "present";
  if (n.type === "leafDirective") return true;
  return false;
}

/** 图形：大块之外，单独成段的图片和整块公式也算 */
function isGraphic(n: Node): boolean {
  if (isPresent(n)) return false;
  if (isHeavy(n) || n.type === "math") return true;
  return n.type === "paragraph" && (n.children ?? []).length === 1 && n.children![0].type === "image";
}

const isPresent = (n: Node) => n.type === "containerDirective" && n.name === "present";

/** 演示里一定留着的：标题、图形、标了 :::present 的文字。其余的文字只在文章里。 */
function graphicsFirst(d: { title?: string; section?: string; parts: Node[]; headingOnly?: boolean }) {
  if (!d.parts.some(isGraphic)) return d;
  return { ...d, parts: d.parts.filter((n) => n.type === "heading" || isPresent(n) || isGraphic(n)) };
}

/** 以冒号结尾的段落是在引出下一个东西（"写出来是这样的："），跟着下一页走 */
function leadsIntoNext(n: Node, body: string): boolean {
  if (isPresent(n)) {
    const last = (n.children ?? []).at(-1);
    return !!last && leadsIntoNext(last, body);
  }
  if (n.type !== "paragraph") return false;
  const text = body.slice(n.position?.start.offset ?? 0, n.position?.end.offset ?? 0).trim();
  return /[：:]$/.test(text);
}

type DraftPage = { title?: string; section?: string; parts: Node[] };

/**
 * 一页里有两个以上的大块时拆开：每个大块一页。
 * 两个大块之间的文字：以冒号结尾的是下一个的引子，跟着下一页；其余的是上一个的说明，留在上一页。
 * 拆出来的后续页，上方用小字标出这一节的标题。
 */
function splitHeavy(d: DraftPage, body: string): DraftPage[] {
  const heavyCount = d.parts.filter(isHeavy).length;
  if (heavyCount < 2) return [d];
  const pages: Node[][] = [[]];
  let hasHeavy = false;
  for (const n of d.parts) {
    if (isHeavy(n) && hasHeavy) {
      // 把紧挨着的引子段落挪到新的一页
      const current = pages[pages.length - 1];
      const moved: Node[] = [];
      while (current.length && leadsIntoNext(current[current.length - 1], body)) moved.unshift(current.pop()!);
      pages.push([...moved, n]);
      continue;
    }
    if (isHeavy(n)) hasHeavy = true;
    pages[pages.length - 1].push(n);
  }
  const kicker = d.section ?? d.title;
  return pages.map((parts, i) => (i === 0 ? { ...d, parts } : { title: undefined, section: kicker, parts }));
}

/** 独占一页的东西：Mermaid 图和场景动画。它们要尽量大，和成段的文字挤在一页里两边都看不清。 */
const isSolo = (n: Node) => (n.type === "code" && n.lang === "mermaid") || (n.type === "containerDirective" && (n.name === "scene" || n.name === "scene3d"));

/** 图和场景动画独占演示页，前后的说明留在相邻的页上，上方用小字标出这一节的标题。 */
function splitSolo(d: DraftPage): DraftPage[] {
  if (!d.parts.some(isSolo)) return [d];
  const pages: DraftPage[] = [];
  let pending: Node[] = [];
  const section = d.title ?? d.section;
  const flushText = () => {
    if (!pending.some((n) => n.type !== "heading")) return;
    pages.push(pages.length ? { section, parts: pending } : { ...d, parts: pending });
    pending = [];
  };
  for (const node of d.parts) {
    if (isSolo(node)) {
      flushText();
      pages.push({ section, parts: [node] });
      pending = [];
    } else {
      pending.push(node);
    }
  }
  flushText();
  return pages;
}

