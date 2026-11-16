import { visit } from "unist-util-visit";
import { parseToTree } from "./parse";
import { narrationCalls, stripNarration } from "../scene/shared";

/**
 * 讲稿归视频工坊（见 docs/design-studio-split.md 的"讲稿归工坊"），文章里不再放讲稿。
 *
 * 以前的文章用两样东西写讲稿：每页的 :::notes，场景代码里每一步的 say("……")。
 * 这里把它们从正文里摘掉：保存时用（摘掉后提醒一句，讲稿到工坊里写），拆演示页时也用（历史版本里还留着的不会显示出来）。
 * 别的地方提到 say 的不动：只摘 :::notes 容器和场景代码块里直接写着一句话的 say()。
 */
export function removeNarration(body: string): { body: string; removed: number } {
  if (!body.includes(":::notes") && !/\bsay\s*\(/.test(body)) return { body, removed: 0 };
  type Edit = { start: number; end: number; text: string; count: number };
  const edits: Edit[] = [];
  visit(parseToTree(body), (node) => {
    const n = node as { type: string; name?: string; children?: { type: string; position?: Position }[]; position?: Position };
    if (n.type !== "containerDirective" || !n.position) return;
    const start = n.position.start.offset!, end = n.position.end.offset!;
    if (n.name === "notes") {
      // 连同后面的空行一起去掉，不留一大段空白
      let after = end;
      while (after < body.length && body[after] === "\n" && after - end < 2) after++;
      edits.push({ start, end: after, text: "", count: 1 });
      return "skip";
    }
    if (n.name === "scene") {
      for (const child of n.children ?? []) {
        if (child.type !== "code" || !child.position) continue;
        const from = child.position.start.offset!, to = child.position.end.offset!;
        const code = body.slice(from, to), count = narrationCalls(code);
        if (count) edits.push({ start: from, end: to, text: stripNarration(code), count });
      }
      return "skip";
    }
  });
  let out = body;
  // 从后往前改，前面的位置不会被挪动
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return { body: out, removed: edits.reduce((sum, edit) => sum + edit.count, 0) };
}

type Position = { start: { offset?: number }; end: { offset?: number } };

/** 保存时摘掉讲稿后给的提醒 */
export const narrationRemovedMessage = (count: number) =>
  `正文里的 ${count} 处讲稿（:::notes 或场景里的 say()）没有保存：讲稿归视频工坊，到工坊的项目里逐拍写。文章里只写给读者看的内容，场景每一步只写 step("画面上的一句话", …)。`;
