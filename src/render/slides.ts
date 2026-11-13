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

type Node = { type: string; depth?: number; name?: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: Node[] };

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

  const slice = (n: Node) => body.slice(n.position?.start.offset ?? 0, n.position?.end.offset ?? 0);
  return slides.map((s) => {
    const notes: string[] = [];
    const kept: string[] = [];
    for (const n of s.parts) {
      if (n.type === "containerDirective" && n.name === "notes") notes.push((n.children ?? []).map((c) => toString(c as never)).join("\n"));
      else kept.push(slice(n));
    }
    return { title: s.title, section: s.title === s.section ? undefined : s.section, source: kept.join("\n\n"), notes: notes.join("\n").trim() };
  });
}
