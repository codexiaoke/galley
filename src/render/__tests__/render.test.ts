import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../Markdown";
import { extractToc } from "../toc";

const render = (body: string) => renderToStaticMarkup(createElement(Markdown, { body, blocks: {} }));

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

  it("单独成段的图片带图注；分步讲解的每一步带着要高亮的行", () => {
    expect(render("![一张图](/media/a.png)")).toContain('class="galley-image-caption">一张图');
    const steps = render(":::steps\n```ts\na\nb\n```\n\n1. {1} 第一步\n2. {2} 第二步\n:::");
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

  it("mermaid 代码块交给图表组件，不当成普通代码显示", () => {
    const html = render("```mermaid\nflowchart LR\n  A --> B\n```");
    expect(html).toContain("galley-mermaid");
    expect(html).not.toContain("galley-code-bar");
  });
});

