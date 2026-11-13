import { toString } from "mdast-util-to-string";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/**
 * 小节标题的网址编号和文章目录。正文渲染和目录用同一个编号函数，链接才对得上。
 * 编号直接用标题文字（中文也保留），空格换成连字符；重名的依次加 -2、-3。
 */
export function headingSlugger() {
  const used = new Map<string, number>();
  return (text: string) => {
    const base =
      text
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^\p{L}\p{N}-]/gu, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "section";
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

export type TocItem = { id: string; text: string; depth: 2 | 3 };

/** 文章目录：二级和三级标题。 */
export function extractToc(body: string): TocItem[] {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(body);
  const slug = headingSlugger();
  const items: TocItem[] = [];
  visit(tree, "heading", (node) => {
    if (node.depth !== 2 && node.depth !== 3) return;
    const text = toString(node).trim();
    items.push({ id: slug(text), text, depth: node.depth });
  });
  return items;
}
