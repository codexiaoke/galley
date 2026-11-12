import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Root as MdastRoot } from "mdast";
import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { BUILTIN_DIRECTIVES, getComponent } from "@/core/markup/components";
import { isBareText, isDirective } from "@/core/markup/parse";
import type { BlockView } from "@/core/services/blocks";
import { CiteHover } from "./CiteHover";

/**
 * 把正文渲染成页面。只有已登记的标记和组件会被渲染成对应的界面，
 * 其余一律还原成普通文字：Agent 写的内容不能在页面上执行任何代码。
 */

type Directive = {
  type: string;
  name: string;
  attributes?: Record<string, string | null | undefined> | null;
  children: unknown[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: Record<string, unknown>;
};

const known = (name: string) => (BUILTIN_DIRECTIVES as readonly string[]).includes(name) || !!getComponent(name);

/** 把标记节点改写成自定义元素，交给下面的 React 组件渲染。 */
function remarkGalley(options: { source: string }) {
  return (tree: MdastRoot) => {
    visit(tree, (node, index, parent) => {
      if (!isDirective(node)) return;
      const d = node as unknown as Directive;
      if (!known(d.name) || isBareText(d)) {
        // 还原成原文。
        const start = d.position?.start.offset ?? 0;
        const end = d.position?.end.offset ?? 0;
        const text = { type: "text" as const, value: options.source.slice(start, end) };
        const replacement = d.type === "textDirective" ? text : { type: "paragraph" as const, children: [text] };
        if (parent && typeof index === "number") parent.children[index] = replacement as never;
        return;
      }
      // 参数整体放进一个字符串属性里，避免和 React 的保留属性（例如 key）冲突。
      d.data = { hName: `galley-${d.name}`, hProperties: { attrs: JSON.stringify(d.attributes ?? {}) } };
    });
  };
}

type ElementProps = { attrs?: string; children?: ReactNode };
const attrsOf = (props: ElementProps): Record<string, string> => JSON.parse(props.attrs ?? "{}");

const formatDate = (d: Date) => new Date(d).toISOString().slice(0, 10);

/**
 * 阅读时不显示系统信息：知识块的内部标题、编号、核实日期、是否过期，读者都不需要看到。
 * 正文里只保留读者关心的东西（内容本身和数据的出处）。
 * 这些系统信息只在后台的审阅预览里显示，由 Markdown 的 review 参数打开。
 */
type Ctx = { blocks: Record<string, BlockView>; review: boolean };

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

function Value({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const { b, key } = attrsOf(props);
  return <span className="galley-value">{ctx.blocks[b]?.values[key] ?? ""}</span>;
}

function DataTable({ block }: { block: BlockView }) {
  const columns = (block.data.columns as string[]) ?? [];
  const rows = (block.data.rows as (string | number)[][]) ?? [];
  return (
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
      <>
        <pre><code>{String(block.data.code ?? "")}</code></pre>
        {ctx.review && <p className="galley-figcaption !mt-1"><SystemInfo block={block} /></p>}
      </>
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

/** 图表。骨架阶段只把柱状图画出来，其余类型先显示成表格。 */
function Chart({ ctx, props }: { ctx: Ctx; props: ElementProps }) {
  const { data, type, title } = attrsOf(props);
  const block = ctx.blocks[data];
  if (!block) return null;
  const rows = ((block.data.rows as (string | number)[][]) ?? []).filter((r) => typeof r[1] === "number");
  const max = Math.max(...rows.map((r) => r[1] as number), 0);
  if ((type ?? "bar") !== "bar" || rows.length === 0 || max <= 0) {
    return <BlockFigure ctx={ctx} block={block} title={title}><DataTable block={block} /></BlockFigure>;
  }
  return (
    <BlockFigure ctx={ctx} block={block} title={title}>
      <div className="galley-chart">
        {rows.map((r, i) => (
          <div key={i} className="galley-chart-row">
            <span className="truncate">{r[0]}</span>
            <span className="galley-chart-bar" style={{ width: `${((r[1] as number) / max) * 100}%` }} />
            <span className="galley-chart-value">{r[1]}</span>
          </div>
        ))}
      </div>
    </BlockFigure>
  );
}

const CALLOUT_TYPES = ["info", "tip", "warning"];

function Callout({ props }: { props: ElementProps }) {
  const type = attrsOf(props).type ?? "info";
  return <aside className={`galley-callout galley-callout-${CALLOUT_TYPES.includes(type) ? type : "info"}`}>{props.children}</aside>;
}

export function Markdown({
  body,
  blocks,
  review = false,
}: {
  body: string;
  blocks: Record<string, BlockView>;
  /** 审阅预览：额外显示知识块的编号、内部标题、核实日期和过期状态。前台阅读时不显示。 */
  review?: boolean;
}) {
  const ctx: Ctx = { blocks, review };
  const processor = unified().use(remarkParse).use(remarkDirective).use(remarkGalley, { source: body }).use(remarkRehype);
  const tree = processor.runSync(processor.parse(body));
  const components = {
    "galley-cite": (props: ElementProps) => <Cite ctx={ctx} props={props} />,
    "galley-value": (props: ElementProps) => <Value ctx={ctx} props={props} />,
    "galley-block": (props: ElementProps) => <BlockEmbed ctx={ctx} props={props} />,
    "galley-chart": (props: ElementProps) => <Chart ctx={ctx} props={props} />,
    "galley-callout": (props: ElementProps) => <Callout props={props} />,
  };
  return (
    <div className="galley-prose">
      {toJsxRuntime(tree, { Fragment, jsx, jsxs, components: components as never })}
    </div>
  );
}
