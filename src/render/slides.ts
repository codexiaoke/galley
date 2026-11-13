import { toString } from "mdast-util-to-string";
import { parseToTree } from "@/core/markup/parse";

/**
 * 把一篇文章切成幻灯片：
 * - 每个二级标题开始新的一页；
 * - 二级标题下面的三级标题也各自成一页（一个小节一页，内容才放得下），
 *   页面上方用小字标出它属于哪个二级标题；二级标题下面直接就是小节时，不单独留一页空的；
 * - 单独一行的 --- 也分页；
 * - 二级标题前面的开场白单独成一页。
 * 页里的 :::notes 是讲稿，从页面上拿掉，单独放在 notes 里
 * （演讲者视图里显示，导出视频时当成字幕的内容）。
 */
export type Slide = { title?: string; section?: string; source: string; notes: string };

type Node = { type: string; depth?: number; name?: string; lang?: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: Node[] };

export function splitSlides(body: string): Slide[] {
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
    if (current.headingOnly && !(node.type === "containerDirective" && node.name === "notes")) current.headingOnly = false;
    current.parts.push(node);
  }
  flush();

  // 一页里有好几个大块（代码演变、算法动画、图、表格……）时，一个大块一页
  const pages = slides.flatMap((d) => splitHeavy(d, body)).flatMap(splitMermaid);

  const slice = (n: Node) => body.slice(n.position?.start.offset ?? 0, n.position?.end.offset ?? 0);
  return pages.map((s) => {
    const notes: string[] = [];
    const kept: string[] = [];
    for (const n of s.parts) {
      if (n.type === "containerDirective" && n.name === "notes") notes.push((n.children ?? []).map((c) => toString(c as never)).join("\n"));
      else kept.push(slice(n));
    }
    return { title: s.title, section: s.title === s.section ? undefined : s.section, source: kept.join("\n\n"), notes: notes.join("\n").trim() };
  });
}

/** 占地方的东西：组件、代码块、表格、整块嵌入。提示框和讲稿不算。 */
function isHeavy(n: Node): boolean {
  if (n.type === "code" || n.type === "table") return true;
  if (n.type === "containerDirective") return n.name !== "notes" && n.name !== "callout";
  if (n.type === "leafDirective") return true;
  return false;
}

/** 以冒号结尾的段落是在引出下一个东西（"写出来是这样的："），跟着下一页走 */
function leadsIntoNext(n: Node, body: string): boolean {
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

/** Mermaid 独占演示页，前后说明保留在相邻页，避免图与长文互相挤占可用高度。 */
function splitMermaid(d: DraftPage): DraftPage[] {
  if (!d.parts.some((n) => n.type === "code" && n.lang === "mermaid")) return [d];
  const pages: DraftPage[] = [];
  let pending: Node[] = [];
  const section = d.title ?? d.section;
  const isNotes = (n: Node) => n.type === "containerDirective" && n.name === "notes";
  const flushText = () => {
    if (!pending.some((n) => n.type !== "heading" && !isNotes(n))) return;
    pages.push(pages.length ? { section, parts: pending } : { ...d, parts: pending });
    pending = [];
  };
  for (const node of d.parts) {
    if (node.type === "code" && node.lang === "mermaid") {
      flushText();
      pages.push({ section, parts: [...pending.filter(isNotes), node] });
      pending = [];
    } else if (isNotes(node) && pending.length === 0 && pages.length) {
      pages[pages.length - 1].parts.push(node);
    } else {
      pending.push(node);
    }
  }
  flushText();
  // 标题和讲稿没有正文时不制造空页，但也不丢弃末尾讲稿。
  if (pending.length && pages.length) pages[pages.length - 1].parts.push(...pending.filter(isNotes));
  return pages;
}
