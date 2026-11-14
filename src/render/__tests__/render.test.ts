import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "../Markdown";
import { extractToc } from "../toc";
import { narrationBeats } from "../narration";
import { splitSlides } from "../slides";

const render = (body: string) => renderToStaticMarkup(createElement(Markdown, { body, blocks: {} }));

/** 交给场景播放器的数据，测试里用来看哪些东西会被送到浏览器 */
const scenesSent = vi.hoisted(() => [] as unknown[]);
const sourcesSent = vi.hoisted(() => [] as (string | undefined)[]);

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
  ScenePlayer: await (async () => {
    const Real = (await import("../client/scene")).ScenePlayer;
    return function ScenePlayerSpy(props: Parameters<typeof Real>[0]) {
      scenesSent.push(props.scene);
      sourcesSent.push(props.source);
      return createElement(Real, props);
    };
  })(),
}));
const renderAll = async (body: string) => render(body);

describe("正文渲染", () => {
  it("讲稿清单的正文目标都有准确渲染锚点，不把讲稿本身列为目标", () => {
    const body = "## 页面标题\n\n解释 **线程**。\n\n- 第一项\n- 第二项\n\n:::notes\n这里是私有讲稿\n:::";
    const page = narrationBeats(body, {})[1];
    const html = renderToStaticMarkup(createElement(Markdown, { body: splitSlides(body)[0].source, blocks: {}, guidePage: 1 }));
    expect(page.targets).toHaveLength(4);
    for (const target of page.targets!) expect(html).toContain(`data-galley-target="${target.id}"`);
    expect(page.targets?.some((target) => target.label.includes("私有讲稿"))).toBe(false);
    expect(render(body)).not.toContain("data-galley-target");
  });
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

describe("场景动画", () => {
  const body = ':::scene{title="页面和 Worker"}\n```js\nconst a = box("页面", { tone: "c2" })\nconst b = box("Worker", { rightOf: a })\nconst link = arrow(a, b, { label: "消息" })\nshow(a)\nstep("把任务发过去。", () => { show(b); show(link); send(link) })\n```\n:::';

  it("页面上是播放器：一开始的画面已经画好，作者的代码不出现在页面里", async () => {
    const { runScenes } = await import("@/core/scene/run");
    const scenes = await runScenes(body);
    const html = renderToStaticMarkup(createElement(Markdown, { body, blocks: {}, scenes }));
    expect(html).toContain("galley-scene");
    expect(html).toContain("页面和 Worker");
    // 第一步之前就 show 出来的东西在第一帧里，还没出现的不画
    expect(html).toContain(">页面</text>");
    expect(html).not.toContain(">Worker</text>");
    // 颜色是主题变量，不是写死的值
    expect(html).toContain("var(--chart-2)");
    expect(html).not.toContain("const a = box");
  });

  it("讲稿不送到文章页面上，只有演示里才带", async () => {
    const spoken = ':::scene\n```js\nconst a = box("页面")\nstep("写给读者的文字。", () => { say("讲的时候说的话。"); show(a) })\n```\n:::';
    const { runScenes } = await import("@/core/scene/run");
    const scenes = await runScenes(spoken);
    // 播放器是客户端组件：它拿到的数据就是会被送到读者浏览器里的数据
    const sent = (extra: object) => {
      scenesSent.length = 0;
      renderToStaticMarkup(createElement(Markdown, { body: spoken, blocks: {}, scenes, ...extra }));
      return JSON.stringify(scenesSent);
    };
    expect(sent({})).toContain("写给读者的文字。");
    expect(sent({})).not.toContain("讲的时候说的话");
    expect(sent({ review: true })).not.toContain("讲的时候说的话");
    expect(sent({ narration: true })).toContain("讲的时候说的话");
  });

  it("有读者能调的东西时才把代码交给浏览器，而且先摘掉讲稿", async () => {
    const plain = ':::scene\n```js\nconst a = box("甲")\nstep("出现。", () => { say("不给读者看的讲稿。"); show(a) })\n```\n:::';
    const tunable = ':::scene\n```js\nconst w = param("w", { min: 50, max: 300, value: 100 })\nconst a = box("甲", { w })\nstep("出现。", () => { say("不给读者看的讲稿。"); show(a) })\n```\n:::';
    const { runScenes } = await import("@/core/scene/run");
    const sent = async (body: string) => {
      sourcesSent.length = 0;
      renderToStaticMarkup(createElement(Markdown, { body, blocks: {}, scenes: await runScenes(body) }));
      return sourcesSent[0];
    };
    expect(await sent(plain)).toBeUndefined();
    const source = await sent(tunable);
    expect(source).toContain('param("w"');
    expect(source).not.toContain("讲稿");
    // 页面上有滑块
    const html = renderToStaticMarkup(createElement(Markdown, { body: tunable, blocks: {}, scenes: await runScenes(tunable) }));
    expect(html).toContain('type="range"');
  });

  it("代码出错时读者什么都看不到，审阅预览里显示错误", async () => {
    const bad = ':::scene\n```js\nshow(nothing)\n```\n:::';
    const { runScenes } = await import("@/core/scene/run");
    const scenes = await runScenes(bad);
    expect(renderToStaticMarkup(createElement(Markdown, { body: bad, blocks: {}, scenes }))).not.toContain("galley-scene");
    expect(renderToStaticMarkup(createElement(Markdown, { body: bad, blocks: {}, scenes, review: true }))).toMatch(/场景代码出错，第 1 行/);
  });
});
