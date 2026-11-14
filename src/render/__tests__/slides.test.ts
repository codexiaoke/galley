import { describe, expect, it } from "vitest";
import { lineIdentities } from "../code-diff";
import { splitSlides, publicSlideSource } from "../slides";
import { turnKind } from "../turn";

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

describe("场景动画演示分页", () => {
  const scene = ':::scene{title="通信"}\n```js\nconst a = box("甲")\nstep("出现。", () => show(a))\n```\n:::';
  it("场景独占一页，前后的说明留在相邻的页上", () => {
    const slides = splitSlides(`## 三道墙\n\n先看一个动画。\n\n${scene}\n\n三道墙各管一件事。`);
    expect(slides).toHaveLength(3);
    expect(slides[0].title).toBe("三道墙");
    expect(slides[0].source).toContain("先看一个动画。");
    expect(slides[1].source).toBe(scene);
    expect(slides[1].section).toBe("三道墙");
    expect(slides[2].source).toBe("三道墙各管一件事。");
  });
  it("标题下面直接是场景时不留空页，场景后的讲稿跟着场景", () => {
    const slides = splitSlides(`## 三道墙\n\n${scene}\n\n:::notes\n讲到沙箱时停一下\n:::`);
    expect(slides).toHaveLength(1);
    expect(slides[0].source).toBe(scene);
    expect(slides[0].section).toBe("三道墙");
    expect(slides[0].notes).toBe("讲到沙箱时停一下");
  });
});

describe("场景里的讲稿不进公开的接口", () => {
  it("say 整句摘掉，写给读者的文字和动作都留着", () => {
    const source = ':::scene\n```js\nconst a = box("甲")\nstep("写给读者的文字。", () => {\n  say("讲的时候说的话。")\n  show(a)\n})\n```\n:::';
    const out = publicSlideSource(`前面一句 say("这不是代码")。\n\n${source}`);
    expect(out).not.toContain("讲的时候说的话");
    expect(out).toContain("写给读者的文字。");
    expect(out).toContain("show(a)");
    // 场景外面的正文不动
    expect(out).toContain('前面一句 say("这不是代码")。');
  });
});

describe("讲稿和正文分开", () => {
  it("讲稿从页面内容里摘出来，不留在 source 里", () => {
    const slides = splitSlides(`## 一节\n\n正文一句。\n\n:::notes\n这是我演讲时自己看的提词\n:::\n\n正文第二句。`);
    expect(slides).toHaveLength(1);
    expect(slides[0].notes).toBe("这是我演讲时自己看的提词");
    // present.json 把 source 公开出去，讲稿绝不能混在里面
    expect(slides[0].source).not.toContain("notes");
    expect(slides[0].source).not.toContain("提词");
    expect(slides[0].source).toContain("正文一句。");
    expect(slides[0].source).toContain("正文第二句。");
  });

  it("一页里写了好几段讲稿时合在一起", () => {
    const slides = splitSlides(`## 一节\n\n正文。\n\n:::notes\n第一段\n:::\n\n:::notes\n第二段\n:::`);
    expect(slides[0].notes).toBe("第一段\n第二段");
    expect(slides[0].source).toBe("## 一节\n\n正文。");
  });
});

describe("转场按两页的关系选", () => {
  // 封面、开场白、「甲」的标题页、甲的两个小节、「乙」的标题页、结尾
  const pages = splitSlides("开场白。\n\n## 甲\n\n甲的引子。\n\n### 甲一\n\n内容。\n\n### 甲二\n\n内容。\n\n## 乙\n\n乙的内容。");
  it("同一节里翻页是接续，换一节是推开，进出封面和结尾是推近拉远", () => {
    expect(pages.map((p) => p.section ?? p.title)).toEqual([undefined, "甲", "甲", "甲", "乙"]);
    expect(turnKind(pages, 0, 1)).toBe("cover");
    expect(turnKind(pages, 1, 2)).toBe("section"); // 开场白不属于任何一节
    expect(turnKind(pages, 2, 3)).toBe("within"); // 标题页到它的小节
    expect(turnKind(pages, 3, 4)).toBe("within");
    expect(turnKind(pages, 4, 3)).toBe("within"); // 往回翻也一样
    expect(turnKind(pages, 4, 5)).toBe("section");
    expect(turnKind(pages, 5, 6)).toBe("cover");
    expect(turnKind(pages, 6, 0)).toBe("cover");
  });
});
