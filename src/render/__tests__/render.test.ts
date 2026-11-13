import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "../Markdown";
import { extractToc } from "../toc";

const render = (body: string) => renderToStaticMarkup(createElement(Markdown, { body, blocks: {} }));

/**
 * 播放器在页面上是按需加载的（client/lazy.tsx 里用 next/dynamic），离开 Next.js 时 next/dynamic 什么都不渲染。
 * 测试里换成直接引用，看渲染出来的内容；按需加载本身在正式构建的页面上验证过。
 */
vi.mock("../client/lazy", async () => ({
  AlgoPlayer: (await import("../client/algo/player")).AlgoPlayer,
  RacePlayer: (await import("../client/algo/race")).RacePlayer,
  CodeStepsPlayer: (await import("../client/code-steps")).CodeStepsPlayer,
  ChartView: (await import("../client/chart")).ChartView,
  FlowView: (await import("../client/flow")).FlowView,
  Compare: (await import("../client/compare")).Compare,
  MermaidDiagram: (await import("../client/mermaid")).MermaidDiagram,
  StepsController: (await import("../client/steps")).StepsController,
  Tabs: (await import("../client/tabs")).Tabs,
  CountUp: (await import("../client/stat")).CountUp,
  ZoomImage: (await import("../client/image")).ZoomImage,
  Quiz: (await import("../client/quiz")).Quiz,
  CodeRunner: (await import("../client/code-runner")).CodeRunner,
}));
const renderAll = async (body: string) => render(body);

describe("正文渲染", () => {
  it("小节标题的编号和目录一致，重名的依次加序号", () => {
    const body = "## 为什么\n\n文字\n\n### Step One\n\n## 为什么\n";
    const toc = extractToc(body);
    expect(toc.map((t) => t.id)).toEqual(["为什么", "step-one", "为什么-2"]);
    const html = render(body);
    for (const item of toc) expect(html).toContain(`id="${item.id}"`);
    expect(html).toContain('class="galley-anchor"');
  });

  it("代码块：高亮、行号、文件名和要标出的行", () => {
    const html = render('```ts title="a.ts" {2}\nconst a = 1;\nconst b = 2;\n```');
    expect(html).toContain("galley-code-file");
    expect(html).toContain("a.ts");
    expect(html).toContain('data-line="2"');
    expect(html).toMatch(/class="line highlighted"[^>]*data-line="2"|data-line="2"[^>]*class="line highlighted"/);
    expect(html).toContain("var(--code-token-keyword)");
  });

  it("认不出的语言按纯文本显示，不报错", () => {
    const html = render("```nosuchlang\nhello <world>\n```");
    expect(html).toContain("hello &lt;world&gt;");
  });

  it("单独成段的图片带图注；分步讲解的每一步带着要高亮的行", async () => {
    expect(await renderAll("![一张图](/media/a.png)")).toContain('class="galley-image-caption">一张图');
    const steps = await renderAll(":::steps\n```ts\na\nb\n```\n\n1. {1} 第一步\n2. {2} 第二步\n:::");
    expect(steps).toContain('data-lines="1"');
    expect(steps).toContain('data-lines="2"');
    expect(steps).not.toContain("{1}");
  });

  it("注释用中文标题", () => {
    expect(render("正文[^1]\n\n[^1]: 注释内容")).toContain("注释");
  });

  it("公式在服务端排好版；标题里有公式时目录的链接也对得上", () => {
    const html = render("复杂度是 $O(n \\log n)$。\n\n$$\n\\sum_{i=1}^n i = \\frac{n(n+1)}{2}\n$$\n\n## 为什么是 $n^2$\n");
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
    const toc = extractToc("## 为什么是 $n^2$\n");
    expect(html).toContain(`id="${toc[0].id}"`);
  });

  it("mermaid 代码块交给图表组件，不当成普通代码显示", async () => {
    const html = await renderAll("```mermaid\nflowchart LR\n  A --> B\n```");
    expect(html).toContain("galley-mermaid");
    expect(html).not.toContain("galley-code-bar");
  });
});


describe("术语", () => {
  const terms = [{ id: "t1", term: "本体（Ontology）", aliases: [], definition: "对一个领域的明确描述。" }];
  const withTerms = (body: string) => renderToStaticMarkup(createElement(Markdown, { body, blocks: {}, terms }));

  it("正文里第一次出现时标出，后面不再标", () => {
    const html = withTerms("先说本体。再说一次本体。");
    expect(html.match(/galley-term"/g) ?? []).toHaveLength(1);
    expect(html).toContain(">本体</span>");
  });

  it("标题、链接、代码里不标", () => {
    const html = withTerms("## 本体\n\n[本体](https://example.com) 和 `本体`");
    expect(html).not.toContain("galley-term");
  });

  it("没有给术语时原样输出", () => {
    expect(render("本体")).not.toContain("galley-term");
  });
});

describe("小测验", () => {
  const quiz = ":::quiz\n哪个对？\n\n- [ ] 甲\n- [x] 乙\n- [ ] 丙\n\n因为乙。\n:::";

  it("题目、选项、解析分开渲染，选项上记着对错，不画勾选框", async () => {
    const html = await renderAll(quiz);
    expect(html).toContain('class="galley-quiz-question"');
    expect(html.match(/data-correct="true"/g)).toHaveLength(1);
    expect(html.match(/data-correct="false"/g)).toHaveLength(2);
    expect(html).toContain('class="galley-quiz-explain"');
    expect(html).not.toContain('type="checkbox"');
  });
});

describe("可以运行的代码块", () => {
  it("加了 run 的 JavaScript 下面有运行按钮，别的代码块没有", async () => {
    expect(await renderAll("```js run\nconsole.log(1)\n```")).toContain("galley-run-button");
    expect(await renderAll("```js\nconsole.log(1)\n```")).not.toContain("galley-run-button");
  });
});
