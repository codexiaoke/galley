/**
 * 演示里两页之间的关系，决定换页时用哪种转场（样式在 globals.css 的"演示的转场"一节）：
 * - within  同一节里翻页：上下接续，标题留在原处；
 * - section 换了一节：左右推开；
 * - cover   进出封面和结尾：推近、拉远。
 *
 * 页码从 0 开始：第 0 页是封面，最后一页是结尾，中间是正文的各页。
 */
export type TurnKind = "within" | "section" | "cover";

export function turnKind(slides: { title?: string; section?: string }[], from: number, to: number): TurnKind {
  const last = slides.length + 1;
  if (from <= 0 || to <= 0 || from >= last || to >= last) return "cover";
  // 一页属于哪一节：小节页上方标着的那个二级标题；二级标题自己那一页就是它的标题
  const sectionOf = (page: number) => slides[page - 1].section ?? slides[page - 1].title;
  const a = sectionOf(from);
  return a !== undefined && a === sectionOf(to) ? "within" : "section";
}
