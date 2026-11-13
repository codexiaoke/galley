import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Root as MdastRoot } from "mdast";
import { toString } from "mdast-util-to-string";
import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import Link from "next/link";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { BUILTIN_DIRECTIVES, getComponent } from "@/core/markup/components";
import { isBareText, isDirective } from "@/core/markup/parse";
import type { FlowGraph } from "@/core/markup/flow";
import { readCodeSteps, readFlow, readSteps, readTrace, STEP_LINES_PATTERN } from "@/core/markup/structure";
import { lineIdentities } from "./code-diff";
import { traceCache, traceKey, type TraceResult } from "@/core/algo/trace-shared";
import type { BlockView } from "@/core/services/blocks";
import type { PostCard } from "@/core/services/documents";
import { CiteHover } from "./CiteHover";
import { findTerms, termSpellings, type Term } from "@/core/markup/terms";
import { highlightCode, languageName, parseCodeMeta } from "./highlight";
import { runAlgorithmVariants } from "@/core/algo";
import { variantsOf } from "@/core/algo/presets";
import { CopyButton } from "./client/copy";
// 播放器按需加载，见 client/lazy.tsx
import { AlgoPlayer, ChartView, CodeStepsPlayer, Compare, CountUp, FlowView, MermaidDiagram, RacePlayer, StepsController, Tabs, ZoomImage } from "./client/lazy";
import { headingSlugger } from "./toc";

/**
 * 把正文渲染成页面。只有已登记的标记和组件会被渲染成对应的界面，
 * 其余一律还原成普通文字：Agent 写的内容不能在页面上执行任何代码。
 *
 * 这个文件在服务端渲染文章页，也在后台编辑页的浏览器里渲染实时预览，所以不能用异步的东西。
 * 带动画和交互的部分在 ./client 下面，都是很小的客户端组件。
 */

type MdNode = {
  type: string;
  name?: string;
  value?: string;
  lang?: string | null;
  meta?: string | null;
  url?: string;
  alt?: string | null;
  title?: string | null;
  depth?: number;
  attributes?: Record<string, string | null | undefined> | null;
  children?: MdNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: Record<string, unknown>;
};

const known = (name: string) => (BUILTIN_DIRECTIVES as readonly string[]).includes(name) || !!getComponent(name);

/** 换成一个自定义元素，参数整体放进一个字符串属性里，避免和 React 的保留属性（例如 key）冲突。 */
const element = (name: string, attrs: object = {}, children?: MdNode[]): MdNode => ({
  type: "galleyElement",
  children: children ?? [],
  data: { hName: name, hProperties: { attrs: JSON.stringify(attrs) }, ...(children ? {} : { hChildren: [] }) },
});

const isOnlyImage = (p: MdNode) => {
  const kids = (p.children ?? []).filter((c) => !(c.type === "text" && !c.value?.trim()));
  return kids.length === 1 && kids[0].type === "image";
};

/** 先序遍历。回调里可以替换当前节点（parent.children[index] = 新节点），之后遍历的是新节点的子节点。 */
function walk(node: MdNode, fn: (node: MdNode, index?: number, parent?: MdNode) => void, index?: number, parent?: MdNode) {
  fn(node, index, parent);
  const current = parent && index !== undefined ? parent.children![index] : node;
  current.children?.forEach((_, i) => walk(current.children![i], fn, i, current));
}

/** 去掉列表项开头的 {1-3}。 */
function stripStepLines(item: MdNode) {
  const paragraph = item.children?.[0];
  const first = paragraph?.children?.[0];
  if (first?.type === "text" && first.value) first.value = first.value.replace(STEP_LINES_PATTERN, "");
}

/** 这些节点里面的文字不标术语：标题、链接、代码、公式，以及各种标记（依据、取值、图表……）。 */
const NO_TERMS = new Set(["heading", "link", "linkReference", "inlineCode", "code", "inlineMath", "math", "textDirective", "leafDirective", "html", "footnoteDefinition", "footnoteReference", "galleyElement"]);

/**
 * 术语：站点上定义过的概念，在正文里第一次出现时加上虚线，悬停看定义（见下面的 TermHover）。
 * 每个术语只标第一次，标多了满篇都是虚线，读者反而看不清。
 */
function remarkTerms(options: { terms: Term[] }) {
  const spellings = termSpellings(options.terms);
  return (tree: MdastRoot) => {
    if (spellings.length === 0) return;
    const done = new Set<string>();
    const visit = (node: MdNode) => {
      if (!node.children || NO_TERMS.has(node.type)) return;
      // 讲稿、算法动画这类容器里也不标
      if (node.type === "containerDirective" && ["notes", "code-steps", "trace", "algo", "race", "chart", "timeline"].includes(node.name ?? "")) return;
      const out: MdNode[] = [];
      for (const child of node.children) {
        if (child.type !== "text" || !child.value) {
          out.push(child);
          visit(child);
          continue;
        }
        const text = child.value;
        const hits = findTerms(text, spellings, done);
        let at = 0;
        for (const hit of hits) {
          done.add(hit.id);
          if (hit.start > at) out.push({ type: "text", value: text.slice(at, hit.start) });
          out.push({ ...element("galley-term", { id: hit.id }, [{ type: "text", value: text.slice(hit.start, hit.end) }]), type: "galleyElement" });
          at = hit.end;
        }
        if (at < text.length) out.push(at === 0 ? child : { type: "text", value: text.slice(at) });
      }
      node.children = out;
    };
    visit(tree as unknown as MdNode);
  };
}

/** 把标记节点改写成自定义元素，交给下面的 React 组件渲染。 */
function remarkGalley(options: { source: string }) {
  const { source } = options;
  return (tree: MdastRoot) => {
    const slug = headingSlugger();

    // 先把连续的几个 ::stat 收进一行。
    walk(tree as unknown as MdNode, (node) => {
      // 已经收好的一行不再收一次，否则会无限地套下去。
      if (!node.children || node.data?.hName === "galley-stats") return;
      const out: MdNode[] = [];
      let run: MdNode[] = [];
      const flush = () => {
        // 一行里的几个数字共用一行出处，写在这一行的下面。
        if (run.length > 1) out.push(element("galley-stats", { blocks: [...new Set(run.map((r) => r.attributes?.b ?? ""))] }, run));
        else out.push(...run);
        run = [];
      };
      for (const child of node.children) {
        if (child.type === "leafDirective" && child.name === "stat") run.push(child);
        else {
          flush();
          out.push(child);
        }
      }
      flush();
      node.children = out;
    });

    walk(tree as unknown as MdNode, (node, index, parent) => {
      const replace = (next: MdNode) => {
        if (parent && typeof index === "number") parent.children![index] = next;
      };

      // 小节标题：生成网址里的 #编号，后面加一个鼠标停留时出现的链接。
      if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
        const id = slug(toString(node as never));
        node.data = { ...node.data, hProperties: { id } };
        node.children = [
          ...(node.children ?? []),
          {
            type: "link",
            url: `#${id}`,
            children: [{ type: "text", value: "#" }],
            data: { hProperties: { className: ["galley-anchor"], "aria-label": "这一节的链接" } },
          },
        ];
        return;
      }

      if (node.type === "code" && node.lang === "mermaid") {
        replace(element("galley-mermaid", { code: node.value ?? "" }));
        return;
      }
      if (node.type === "code") {
        replace(element("galley-code", { code: node.value ?? "", lang: node.lang ?? "", meta: node.meta ?? "" }));
        return;
      }

      // 单独成段的图片：放大查看，说明文字作为图注。
      if (node.type === "paragraph" && isOnlyImage(node)) {
        const img = node.children!.find((c) => c.type === "image")!;
        replace(element("galley-image", { src: img.url, alt: img.alt ?? "", title: img.title ?? "" }));
        return;
      }

      if (!isDirective(node as never)) return;
      const d = node;
      if (!known(d.name!) || isBareText(d as never)) {
        // 还原成原文。
        const start = d.position?.start.offset ?? 0;
        const end = d.position?.end.offset ?? 0;
        const text: MdNode = { type: "text", value: source.slice(start, end) };
        replace(d.type === "textDirective" ? text : { type: "paragraph", children: [text] });
        return;
      }

      const attrs: Record<string, unknown> = { ...(d.attributes ?? {}) };
      if (d.name === "steps") {
        const { parts } = readSteps(d as never, source);
        if (!parts) return replace({ type: "paragraph", children: [{ type: "text", value: "" }] });
        const children = d.children!;
        const list = children[parts.listIndex];
        const items = (list.children ?? []).map((item, i) => {
          stripStepLines(item);
          return { ...item, data: { hName: "li", hProperties: { "data-lines": parts.lines[i] ?? "" } } };
        });
        d.children = [
          { type: "galleyElement", children: [children[parts.codeIndex]], data: { hName: "div", hProperties: { className: ["galley-steps-code"] } } },
          { type: "galleyElement", children: items, data: { hName: "ol", hProperties: { className: ["galley-steps-list"] } } },
        ];
      }
      if (d.name === "flow") {
        attrs.graph = readFlow(d as never, source).graph ?? null;
        d.data = { hName: "galley-flow", hProperties: { attrs: JSON.stringify(attrs) }, hChildren: [] };
        return;
      }
      if (d.name === "code-steps") {
        const { steps } = readCodeSteps(d as never);
        const kids = d.children ?? [];
        // 每一步的讲解收进一个元素里，顺序和代码块一一对应
        const notes = steps.map((s) => kids.slice(s.noteFrom, s.noteTo));
        // 每一步停留多久：按讲解的字数估一个阅读时间
        const durations = notes.map((n) => {
          const chars = n.map((x) => toString(x as never)).join("").length;
          return Math.min(12000, Math.max(3200, 1800 + chars * 140));
        });
        d.children = notes.map((n) => ({ type: "galleyElement", children: n, data: { hName: "div", hProperties: { className: ["galley-codesteps-text"] } } }));
        const texts = notes.map((n) => n.map((x) => toString(x as never)).join(" ").trim());
        d.data = {
          hName: "galley-code-steps",
          hProperties: { attrs: JSON.stringify({ title: d.attributes?.title ?? "", texts, steps: steps.map((s, i) => ({ code: s.code, lang: s.lang, meta: s.meta, duration: durations[i] })) }) },
        };
        return;
      }
      if (d.name === "trace") {
        const t = readTrace(d as never);
        const code = t.code ?? "";
        const keys = variantsOf(t.input, t.presets).map((v) => ({ name: v.name, key: traceKey(code, v.input) }));
        d.data = { hName: "galley-trace", hProperties: { attrs: JSON.stringify({ keys, code, title: t.title ?? "" }) }, hChildren: [] };
        return;
      }
      if (d.name === "tabs") {
        const tabs = (d.children ?? []).filter((c) => c.type === "containerDirective" && c.name === "tab");
        attrs.labels = tabs.map((t) => t.attributes?.label ?? "");
        d.children = tabs;
      }
      d.data = { hName: `galley-${d.name}`, hProperties: { attrs: JSON.stringify(attrs) } };
    });
  };
}

type ElementProps = { attrs?: string; children?: ReactNode };
const attrsOf = <T = Record<string, string>,>(props: ElementProps): T => JSON.parse(props.attrs ?? "{}");

const formatDate = (d: Date) => new Date(d).toISOString().slice(0, 10);

/**
 * 阅读时不显示系统信息：知识块的内部标题、编号、核实日期、是否过期，读者都不需要看到。
 * 正文里只保留读者关心的东西（内容本身和数据的出处）。
 * 这些系统信息只在后台的审阅预览里显示，由 Markdown 的 review 参数打开。
 */
type Ctx = { blocks: Record<string, BlockView>; posts: Record<string, PostCard>; review: boolean; traces: Record<string, TraceResult>; terms: Map<string, Term> };

function Sources({ block }: { block: BlockView }) {
  if (block.sources.length === 0) return null;
  return (
    <span className="block">
      来源：
      {block.sources.map((s, i) => (
        <a key={i} href={s.url} target="_blank" rel="noreferrer nofollow" className="mr-2">
          {s.title ?? new URL(s.url).hostname}
        </a>
      ))}
    </span>
  );
}

const isStale = (block: BlockView) => block.status === "stale" || block.status === "retired";

/** 只在审阅预览里出现的系统信息。 */
function SystemInfo({ block }: { block: BlockView }) {
  return (
    <span className="block">
      {block.id} · {block.title} · 核实于 {formatDate(block.revisedAt)}
      {isStale(block) && <span style={{ color: "#c47a12" }}> · 已标记为过期</span>}
    </span>
  );
}

/**
 * 依据：文章自己的文字，鼠标悬停（触屏上点击）时显示它所依据的知识块。定位见 CiteHover。
 * 卡片是读者主动查看才出现的，里面只放这条依据的内容和出处。
 */
function Cite({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const ids = (attrsOf(props).b ?? "").split(/\s+/).filter(Boolean);
  const found = ids.map((id) => ctx.blocks[id]).filter(Boolean);
  if (found.length === 0) return <>{props.children}</>;
  const card = found.map((b) => (
    <span key={b.id} className="galley-cite-item">
      <span className="galley-cite-statement">{b.body}</span>
      <Sources block={b} />
      {ctx.review && <SystemInfo block={b} />}
    </span>
  ));
  return (
    <CiteHover marked={ctx.review && found.some(isStale)} card={card}>
      {props.children}
    </CiteHover>
  );
}

/** 术语：虚线下划线，悬停（触屏上点击）看它的定义。和依据用同一种浮动卡片。 */
function TermHover({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const term = ctx.terms.get(attrsOf(props).id ?? "");
  if (!term) return <>{props.children}</>;
  const card = (
    <span className="galley-cite-item">
      <span className="galley-term-name">
        {term.term}
        {term.aliases.length > 0 && <span className="galley-term-aliases">也叫 {term.aliases.join("、")}</span>}
      </span>
      <span className="galley-cite-statement">{term.definition}</span>
      <Link href={`/graph?focus=${term.id}`} className="galley-term-link" prefetch={false}>
        在知识图谱里看 →
      </Link>
    </span>
  );
  return (
    <CiteHover card={card} className="galley-term">
      {props.children}
    </CiteHover>
  );
}

function Value({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const { b, key } = attrsOf(props);
  return <span className="galley-value">{ctx.blocks[b]?.values[key] ?? ""}</span>;
}

/**
 * 代码框：标题栏左边是文件名（没写时是语言名），右边是复制按钮；下面是高亮后的代码。
 * 每行带 data-line 行号，分步讲解（steps）靠它找到要高亮的行。
 */
function CodeBlock({ code, lang, meta, footer }: { code: string; lang?: string; meta?: string; footer?: ReactNode }) {
  const { title, highlight } = parseCodeMeta(meta);
  const pre = highlightCode(code, lang, highlight);
  const label = title ?? languageName(lang);
  return (
    <figure className="galley-code" data-has-highlight={highlight.size > 0 || undefined}>
      <figcaption className="galley-code-bar">
        <span className={title ? "galley-code-file" : "galley-code-lang"}>{label}</span>
        <CopyButton text={code.replace(/\n$/, "")} />
      </figcaption>
      {toJsxRuntime(pre, { Fragment, jsx, jsxs })}
      {footer}
    </figure>
  );
}

function DataTable({ block }: { block: BlockView }) {
  const columns = (block.data.columns as string[]) ?? [];
  const rows = (block.data.rows as (string | number)[][]) ?? [];
  return (
    <div className="galley-table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 嵌入内容的外框。说明文字只包含作者写给读者的标题和数据的出处；
 * 两者都没有时不显示说明。
 */
function BlockFigure({
  ctx,
  block,
  title,
  children,
}: {
  ctx: Ctx;
  block: BlockView;
  title?: string;
  children: ReactNode;
}) {
  const hasCaption = !!title || block.sources.length > 0 || ctx.review;
  return (
    <figure className="galley-figure">
      {children}
      {hasCaption && (
        <figcaption className="galley-figcaption">
          {title && <span className="galley-figcaption-title">{title}</span>}
          <Sources block={block} />
          {ctx.review && <SystemInfo block={block} />}
        </figcaption>
      )}
    </figure>
  );
}

/** 整块嵌入：按知识块的类型显示。 */
function BlockEmbed({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const block = ctx.blocks[attrsOf(props).id];
  if (!block) return null;
  if (block.type === "code") {
    // 代码块和正文里普通的代码块长得一样，读者不需要知道它来自知识库。
    return (
      <CodeBlock
        code={String(block.data.code ?? "")}
        lang={String(block.data.language ?? "")}
        footer={ctx.review ? <p className="galley-figcaption galley-code-review"><SystemInfo block={block} /></p> : undefined}
      />
    );
  }
  if (block.type === "data") return <BlockFigure ctx={ctx} block={block}><DataTable block={block} /></BlockFigure>;
  if (block.type === "concept") {
    return (
      <BlockFigure ctx={ctx} block={block} title={String(block.data.term ?? block.title)}>
        <p className="whitespace-pre-wrap">{block.body}</p>
      </BlockFigure>
    );
  }
  return <BlockFigure ctx={ctx} block={block}><p className="whitespace-pre-wrap">{block.body}</p></BlockFigure>;
}

/** 图表：数据来自数据类知识块，画图和动画交给 ChartView。 */
function Chart({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const { data, type, title } = attrsOf(props);
  const block = ctx.blocks[data];
  if (!block) return null;
  const columns = ((block.data.columns as string[]) ?? []).map(String);
  const rows = (block.data.rows as (string | number)[][]) ?? [];
  const unit = typeof block.data.unit === "string" ? block.data.unit : undefined;
  return (
    <BlockFigure ctx={ctx} block={block} title={title}>
      <ChartView type={(type as "bar" | "line" | "pie") ?? "bar"} columns={columns} rows={rows} unit={unit} label={title} />
    </BlockFigure>
  );
}

/** 关键数字：事实块的一个命名取值，放大显示，滚到眼前时从 0 滚到这个数。 */
function Stat({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const { b, key, label } = attrsOf(props);
  const block = ctx.blocks[b];
  const value = block?.values[key];
  if (!block || value === undefined) return null;
  return (
    <figure className="galley-stat">
      <CountUp value={value} />
      <figcaption>
        <span className="galley-stat-label">{label}</span>
        {block.sources.length > 0 && (
          <span className="galley-stat-source">
            {block.sources.slice(0, 1).map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer nofollow">
                {s.title ?? new URL(s.url).hostname}
              </a>
            ))}
          </span>
        )}
        {ctx.review && <span className="galley-figcaption block"><SystemInfo block={block} /></span>}
      </figcaption>
    </figure>
  );
}

/** 排成一行的几个关键数字。出处合在一起写在下面，不在每个数字下面重复。 */
function Stats({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const ids = attrsOf<{ blocks?: string[] }>(props).blocks ?? [];
  const sources = ids.flatMap((id) => ctx.blocks[id]?.sources ?? []);
  const unique = sources.filter((s, i) => sources.findIndex((t) => t.url === s.url) === i);
  return (
    <figure className="galley-stats-figure">
      <div className="galley-stats">{props.children}</div>
      {unique.length > 0 && (
        <figcaption className="galley-figcaption galley-stats-source">
          来源：
          {unique.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer nofollow" className="mr-2">
              {s.title ?? new URL(s.url).hostname}
            </a>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/** 时间线：作者写的是一个列表，样式把它画成一条竖线和一串节点。 */
function Timeline({ props }: { props: ElementProps }) {
  return <div className="galley-timeline">{props.children}</div>;
}

/**
 * 引文：把一个知识块作为一段突出的引文。观点和经历就是站长自己的话，不加署名；
 * 事实和概念带上出处。
 */
function Quote({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const block = ctx.blocks[attrsOf(props).b];
  if (!block) return null;
  return (
    <figure className="galley-quote">
      <blockquote>{block.body}</blockquote>
      {(block.sources.length > 0 || ctx.review) && (
        <figcaption className="galley-figcaption">
          <Sources block={block} />
          {ctx.review && <SystemInfo block={block} />}
        </figcaption>
      )}
    </figure>
  );
}

/** 文章卡片：站内另一篇已发布的文章。那篇文章下线了就不显示。 */
function Post({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const post = ctx.posts[attrsOf(props).slug];
  if (!post) return null;
  return (
    <Link href={`/posts/${post.slug}`} className="galley-post-card">
      <span className="galley-post-card-title">{post.title}</span>
      {post.summary && <span className="galley-post-card-summary">{post.summary}</span>}
      {post.publishedAt && <span className="galley-post-card-meta">{formatDate(post.publishedAt)}</span>}
    </Link>
  );
}

const CALLOUT_TYPES = ["info", "tip", "warning"];

function Callout({ props }: { props: ElementProps }) {
  const type = attrsOf(props).type ?? "info";
  return <aside className={`galley-callout galley-callout-${CALLOUT_TYPES.includes(type) ? type : "info"}`}>{props.children}</aside>;
}

/** 算法动画：在这里按输入生成每一帧，播放交给 AlgoPlayer。 */
function Algo({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const { type, input, presets, target, start, title } = attrsOf(props);
  const run = runAlgorithmVariants(type, { input, presets, target, start });
  if (run.error || !run.def) return ctx.review ? <p className="galley-trace-error">算法动画出错：{run.error}</p> : null;
  return <AlgoPlayer label={run.def.label} title={title} code={run.def.code} legend={run.def.legend} variants={run.variants} />;
}

/** 代码一步一步演变：每一步高亮好，算出每一行的身份，交给播放器。 */
function CodeSteps({ props }: { props: ElementProps }) {
  const { title, steps, texts } = attrsOf<{ title: string; texts: string[]; steps: { code: string; lang: string; meta: string; duration: number }[] }>(props);
  const codeLines = steps.map((s) => s.code.replace(/\n$/, "").split("\n"));
  const { keys, changed } = lineIdentities(codeLines);
  const rendered = steps.map((s, i) => {
    const { title: file, highlight } = parseCodeMeta(s.meta);
    const pre = highlightCode(s.code, s.lang);
    const codeEl = pre.children.find((c) => c.type === "element");
    const lines = codeEl && "children" in codeEl ? codeEl.children.filter((c) => c.type === "element") : [];
    return {
      lines: lines.map((line, k) => ({
        key: keys[i][k],
        node: <Fragment key={k}>{toJsxRuntime({ type: "root", children: (line as unknown as { children: never[] }).children }, { Fragment, jsx, jsxs })}</Fragment>,
      })),
      // 指定了高亮行就用指定的，否则高亮这一步改动的行
      focus: highlight.size ? [...highlight].map((n) => n - 1) : [...changed[i]],
      file,
      duration: s.duration,
    };
  });
  return (
    <CodeStepsPlayer title={title || undefined} lang={languageName(steps[0]?.lang)} steps={rendered} texts={texts}>
      {props.children}
    </CodeStepsPlayer>
  );
}

/** 算法比赛：每个算法、每组输入各生成一份动画，交给 RacePlayer 并排播放。 */
function Race({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const { types, input, presets, target, start, title } = attrsOf(props);
  const names = (types ?? "").split(/[,，\s]+/).filter(Boolean);
  const lanes = [];
  for (const name of names) {
    const run = runAlgorithmVariants(name, { input, presets, target, start });
    if (run.error || !run.def) return ctx.review ? <p className="galley-trace-error">算法比较出错：{run.error}</p> : null;
    lanes.push({ label: run.def.label, variants: run.variants });
  }
  return lanes.length >= 2 ? <RacePlayer title={title} lanes={lanes} /> : null;
}

/**
 * 代码驱动的动画：代码已经在服务端的沙箱里跑过（页面渲染前调用 runTraces），这里取结果。
 * 拿不到结果或者代码出错时，读者看到的是代码本身；审阅预览里显示错误。
 */
function Trace({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const { keys, code, title } = attrsOf<{ keys: { name: string; key: string }[]; code: string; title: string }>(props);
  const results = keys.map((k) => ({ name: k.name, result: ctx.traces[k.key] ?? traceCache.get(k.key) }));
  const failed = results.find((r) => !r.result?.ok);
  if (!failed) {
    const variants = results.map((r) => ({ name: r.name, frames: (r.result as Extract<TraceResult, { ok: true }>).frames }));
    const legend = (results[0].result as Extract<TraceResult, { ok: true }>).legend;
    // 代码区用和代码块一样的高亮，一行一项交给播放器
    const pre = highlightCode(code, "js");
    const codeEl = pre.children.find((c) => c.type === "element");
    const lines = codeEl && "children" in codeEl ? codeEl.children.filter((c) => c.type === "element") : [];
    const nodes = lines.map((line, i) => <Fragment key={i}>{toJsxRuntime({ type: "root", children: (line as unknown as { children: never[] }).children }, { Fragment, jsx, jsxs })}</Fragment>);
    return <AlgoPlayer label={title || "代码演示"} code={nodes} legend={legend} variants={variants} />;
  }
  const result = failed.result;
  return (
    <>
      {ctx.review && <p className="galley-trace-error">{result && !result.ok ? `演示代码出错，${result.error}` : "演示代码还没有运行。"}</p>}
      <CodeBlock code={code} lang="js" />
    </>
  );
}

function Fold({ props }: { props: ElementProps }) {
  return (
    <details className="galley-fold">
      <summary>{attrsOf(props).title}</summary>
      <div className="galley-fold-body">{props.children}</div>
    </details>
  );
}

export function Markdown({
  body,
  blocks,
  posts = {},
  review = false,
  traces = {},
  terms = [],
}: {
  body: string;
  blocks: Record<string, BlockView>;
  /** 文章卡片引用到的站内文章 */
  posts?: Record<string, PostCard>;
  /** 审阅预览：额外显示知识块的编号、内部标题、核实日期和过期状态。前台阅读时不显示。 */
  review?: boolean;
  /** 演示代码的运行结果（runTraces 的返回值）。服务端渲染时也可以省略，直接从缓存取。 */
  traces?: Record<string, TraceResult>;
  /** 站点上的术语（见 core/services/knowledge.ts 的 listTerms）。给了才标，正文里每个术语只标第一次出现 */
  terms?: Term[];
}) {
  const ctx: Ctx = { blocks, posts, review, traces, terms: new Map(terms.map((t) => [t.id, t])) };
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkGalley, { source: body })
    .use(remarkTerms, { terms })
    .use(remarkRehype, {
      footnoteLabel: "注释",
      footnoteLabelProperties: { className: ["galley-footnotes-label"] },
      footnoteBackLabel: "回到正文",
      footnoteBackContent: "↩",
    })
    // 公式在这里就排好版（服务端渲染，读者的浏览器不用再算），写错的公式保存时已经挡住了
    .use(rehypeKatex, { strict: "ignore", output: "htmlAndMathml" });
  const tree = processor.runSync(processor.parse(body));
  const components = {
    "galley-cite": (props: ElementProps) => <Cite ctx={ctx} props={props} />,
    "galley-value": (props: ElementProps) => <Value ctx={ctx} props={props} />,
    "galley-term": (props: ElementProps) => <TermHover ctx={ctx} props={props} />,
    "galley-block": (props: ElementProps) => <BlockEmbed ctx={ctx} props={props} />,
    "galley-chart": (props: ElementProps) => <Chart ctx={ctx} props={props} />,
    "galley-stat": (props: ElementProps) => <Stat ctx={ctx} props={props} />,
    "galley-stats": (props: ElementProps) => <Stats ctx={ctx} props={props} />,
    "galley-callout": (props: ElementProps) => <Callout props={props} />,
    "galley-timeline": (props: ElementProps) => <Timeline props={props} />,
    "galley-quote": (props: ElementProps) => <Quote ctx={ctx} props={props} />,
    "galley-post": (props: ElementProps) => <Post ctx={ctx} props={props} />,
    "galley-fold": (props: ElementProps) => <Fold props={props} />,
    "galley-algo": (props: ElementProps) => <Algo ctx={ctx} props={props} />,
    "galley-trace": (props: ElementProps) => <Trace ctx={ctx} props={props} />,
    "galley-race": (props: ElementProps) => <Race ctx={ctx} props={props} />,
    "galley-code-steps": (props: ElementProps) => <CodeSteps props={props} />,
    // 讲稿只在演示模式和视频里用（见 render/slides.ts），文章里不显示
    "galley-notes": () => null,
    "galley-mermaid": (props: ElementProps) => <MermaidDiagram code={attrsOf(props).code} review={ctx.review} />,
    "galley-code": (props: ElementProps) => {
      const { code, lang, meta } = attrsOf(props);
      return <CodeBlock code={code} lang={lang} meta={meta} />;
    },
    "galley-image": (props: ElementProps) => {
      const { src, alt, title } = attrsOf(props);
      return <ZoomImage src={src} alt={alt} caption={title || alt} />;
    },
    "galley-steps": (props: ElementProps) => <StepsController>{props.children}</StepsController>,
    "galley-flow": (props: ElementProps) => {
      const { graph } = attrsOf<{ graph: FlowGraph | null }>(props);
      return graph ? <FlowView graph={graph} /> : null;
    },
    "galley-tabs": (props: ElementProps) => <Tabs labels={attrsOf<{ labels: string[] }>(props).labels}>{props.children}</Tabs>,
    "galley-tab": (props: ElementProps) => <>{props.children}</>,
    "galley-compare": (props: ElementProps) => {
      const a = attrsOf(props);
      return <Compare before={a.before} after={a.after} beforeLabel={a.beforeLabel || "之前"} afterLabel={a.afterLabel || "之后"} />;
    },
    // 宽表格在窄屏上左右滑动，不撑破版面
    table: (props: { children?: ReactNode }) => (
      <div className="galley-table-wrap">
        <table>{props.children}</table>
      </div>
    ),
  };
  return (
    <div className="galley-prose">
      {toJsxRuntime(tree, { Fragment, jsx, jsxs, components: components as never })}
    </div>
  );
}
