import { describe, expect, it } from "vitest";
import { lineIdentities } from "../code-diff";
import { splitSlides } from "../slides";

describe("演示和代码演变", () => {
  it("每个二级标题一页，--- 也分页，讲稿从页面上拿出来", () => {
    const slides = splitSlides("开场白。\n\n## 第一页\n\n内容一\n\n:::notes\n讲稿一\n:::\n\n---\n\n分开的一页\n\n## 第三页\n\n内容三");
    expect(slides.map((s) => s.title)).toEqual([undefined, "第一页", undefined, "第三页"]);
    expect(slides[1].notes).toBe("讲稿一");
    expect(slides[1].source).not.toContain("notes");
  });

  it("三级标题各成一页，标出所属的二级标题；二级标题下面直接是小节时不留空页", () => {
    const slides = splitSlides("## 图表\n\n### 折线图\n\n一\n\n### 环形图\n\n二\n\n## 代码\n\n说明\n\n### 例子\n\n三");
    expect(slides.map((s) => [s.title, s.section])).toEqual([
      ["折线图", "图表"],
      ["环形图", "图表"],
      ["代码", undefined],
      ["例子", "代码"],
    ]);
  });

  it("没变的行沿用上一步的身份，改动的行算新行并标出来", () => {
    const { keys, changed } = lineIdentities([
      ["function f() {", "  return 1", "}"],
      ["function f() {", "  const x = 1", "  return x", "}"],
    ]);
    expect(keys[1][0]).toBe(keys[0][0]);
    expect(keys[1][3]).toBe(keys[0][2]);
    expect([...changed[1]]).toEqual([1, 2]);
    expect(changed[0].size).toBe(0);
  });

  it("一页里有几个大块时一个大块一页，冒号结尾的引子跟着下一个走", () => {
    const body = "## 查询\n\n从张三出发：\n\n::algo{type=graph-bfs input=\"A-B\"}\n\n图上一目了然。\n\n换成代码是这样的：\n\n```sql\nSELECT 1;\n```\n\n:::notes\n讲稿\n:::";
    const slides = splitSlides(body);
    expect(slides).toHaveLength(2);
    expect(slides[0].title).toBe("查询");
    expect(slides[0].source).toContain("图上一目了然");
    expect(slides[0].source).not.toContain("换成代码");
    expect(slides[1].section).toBe("查询");
    expect(slides[1].source).toContain("换成代码是这样的");
    expect(slides[1].notes).toBe("讲稿");
  });
});


describe("Mermaid 演示分页", () => {
  const graph = "```mermaid\nflowchart TB\nA --> B\n```";
  it("长篇说明与图各自分页，原图方向和前后正文保持完整", () => {
    const slides = splitSlides(`## 支付流程\n\n前置说明。\n\n${graph}\n\n后续说明。`);
    expect(slides).toHaveLength(3);
    expect(slides[0].source).toContain("前置说明。");
    expect(slides[1].source).toBe(graph);
    expect(slides[1].section).toBe("支付流程");
    expect(slides[2].source).toBe("后续说明。");
  });
  it("仅有标题和图时不生成空页，图后的讲稿仍归属于图", () => {
    const slides = splitSlides(`## 支付流程\n\n${graph}\n\n:::notes\n图的讲稿\n:::`);
    expect(slides).toHaveLength(1);
    expect(slides[0].source).toBe(graph);
    expect(slides[0].section).toBe("支付流程");
    expect(slides[0].notes).toBe("图的讲稿");
  });
});
