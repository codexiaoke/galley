import { FileText, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * 后台的通用界面零件。只有样式，没有状态，服务端和客户端组件都能用。
 * 弹框在 modal.tsx，下拉选择在 select.tsx，复制按钮在 copy.tsx。
 *
 * 风格参照 Notion 和飞书这类文档工具，几条规矩：
 * - 内容直接排在白底上，不套卡片；分区靠留白和一条细线。
 * - 不用投影堆层次，不给图标加底色方块。
 * - 颜色只用在标签和主按钮上，其余都是文字的深浅。
 * - 行内的操作平时是灰色的，悬停才显出来，不和内容抢注意力。
 */

// ---- 色调 ------------------------------------------------------------------

/** 标签可以用的几种淡色。 */
export type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "purple" | "orange" | "pink";

const TAG_NAME: Record<Tone, string> = {
  neutral: "gray",
  blue: "blue",
  green: "green",
  amber: "yellow",
  red: "red",
  purple: "purple",
  orange: "orange",
  pink: "pink",
};

const tagStyle = (tone: Tone): CSSProperties => ({
  background: `var(--a-tag-${TAG_NAME[tone]})`,
  color: `var(--a-tag-${TAG_NAME[tone]}-text)`,
});

const VARIED: Tone[] = ["blue", "green", "amber", "purple", "orange", "pink", "red"];

/** 根据文字固定地挑一种颜色：同一个分类名永远是同一种颜色，不同的分类大概率不同。 */
export function toneFor(text: string): Tone {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return VARIED[hash % VARIED.length];
}

// ---- 按钮和输入框 ----------------------------------------------------------

export const BUTTON = {
  base: "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-[background-color,color,transform,box-shadow] duration-100 active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--a-primary-soft)] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
  primary: "bg-a-primary text-white shadow-[inset_0_0_0_1px_rgb(15_15_15/0.1),0_1px_2px_rgb(15_15_15/0.1)] hover:bg-a-primary-strong",
  secondary: "bg-a-surface text-a-text shadow-[inset_0_0_0_1px_var(--a-border),0_1px_2px_rgb(15_15_15/0.04)] hover:bg-a-subtle",
  danger: "bg-a-danger text-white shadow-[inset_0_0_0_1px_rgb(15_15_15/0.1),0_1px_2px_rgb(15_15_15/0.1)] hover:opacity-90",
  /** 表格行里的操作：平时是灰色文字，悬停才有底色 */
  link: "!px-1.5 !py-0.5 !font-normal text-a-muted hover:bg-a-subtle hover:text-a-text",
  linkDanger: "!px-1.5 !py-0.5 !font-normal text-a-muted hover:bg-a-danger-soft hover:text-a-danger",
} as const;

export type ButtonVariant = Exclude<keyof typeof BUTTON, "base">;
export const buttonClass = (variant: ButtonVariant = "secondary") => `${BUTTON.base} ${BUTTON[variant]}`;

/** 表格行里的链接，样子和行内操作一致。 */
export const ROW_LINK =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm whitespace-nowrap text-a-muted transition-colors duration-100 hover:bg-a-subtle hover:text-a-text";

export const INPUT =
  "w-full rounded-md bg-a-subtle/70 px-3 py-1.5 text-sm text-a-text shadow-[inset_0_0_0_1px_var(--a-border)] transition-shadow duration-100 placeholder:text-a-muted focus:bg-a-surface focus:outline-none focus:shadow-[inset_0_0_0_1px_var(--a-primary),0_0_0_3px_var(--a-primary-soft)]";

// ---- 图标 ------------------------------------------------------------------

/** 一个不带底色的线条图标。neutral 是灰色，其余色调取对应标签的文字色。 */
export function IconTile({ icon: Icon, tone = "neutral", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const glyph = { sm: 15, md: 17, lg: 20 }[size];
  return <Icon size={glyph} strokeWidth={1.7} className="shrink-0" style={{ color: tone === "neutral" ? "var(--a-muted)" : `var(--a-tag-${TAG_NAME[tone]}-text)` }} />;
}

/** 列表行首的小图标，像文档列表里每一行前面的那个页面图标。 */
export function LetterTile({ icon: Icon = FileText }: { text?: string; tone?: Tone; icon?: LucideIcon }) {
  return <Icon size={17} strokeWidth={1.6} className="shrink-0 text-a-muted" />;
}

// ---- 页头 ------------------------------------------------------------------

/** 页面顶部：大标题和一行说明，右侧放主要操作。 */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[2rem] font-bold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl leading-relaxed text-a-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---- 分区 ------------------------------------------------------------------

/**
 * 页面里的一个分区：一行小标题，下面是内容，底部可以有一行脚注。
 * 放表格时用 flush：内容直接排在页面上，只在顶部画一条细线。
 * 其他内容用一个很淡的边框框起来。
 */
export function Card({
  icon: Icon,
  title,
  description,
  actions,
  footer,
  children,
  flush = false,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section>
      {title && (
        <header className="mb-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={16} strokeWidth={1.7} className="text-a-muted" />}
            <h2 className="font-semibold">{title}</h2>
            {description && <span className="text-xs text-a-muted">{description}</span>}
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? "border-t border-a-border" : "rounded-lg border border-a-border p-5"}>{children}</div>
      {footer && <p className="mt-2.5 text-xs text-a-muted">{footer}</p>}
    </section>
  );
}

// ---- 统计 ------------------------------------------------------------------

/**
 * 看板上的一个数字：一行小字的名称、数值、一句说明。没有图标和色条。
 * emphasis 为真时数值用强调色，表示这个数需要你注意。
 */
export function StatCard({ label, value, hint, emphasis }: { label: string; value: number; hint?: string; emphasis?: "primary" | "warning" }) {
  const color = emphasis === "primary" ? "text-a-primary" : emphasis === "warning" ? "text-a-warning" : "";
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-a-muted">{label}</p>
      <p className={`mt-2 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums ${color}`}>
        <CountUp value={value} />
      </p>
      {hint && <p className="mt-2 text-xs text-a-muted">{hint}</p>}
    </div>
  );
}

// ---- 标签 ------------------------------------------------------------------

/**
 * 标签。两种形状：
 * - 默认是小圆角的方形标签，用来表示分类、类型这类"属性"；
 * - dot 为真时是带圆点的胶囊形，用来表示"状态"。
 */
export function Badge({ tone = "neutral", dot = false, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs leading-5 whitespace-nowrap ${dot ? "rounded-full py-px pl-2 pr-2.5" : "rounded-[4px] px-1.5"}`}
      style={tagStyle(tone)}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

// ---- 表格 ------------------------------------------------------------------

/** 表格。直接排在页面上：表头是一行灰色小字，行与行之间一条细线，悬停时整行底色变浅灰。 */
export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-a-border text-xs text-a-muted">
            {head.map((cell, i) => (
              <th key={i} className="px-3 py-2 font-normal whitespace-nowrap first:pl-1">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-a-border [&>tr]:transition-colors [&>tr]:duration-100 [&>tr:hover]:bg-a-subtle/70 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_td:first-child]:pl-1">
          {children}
        </tbody>
      </table>
      {empty}
    </div>
  );
}

/** 表格行里"主要的那一格"：左边一个小图标，右边是标题和一行小字。 */
export function PrimaryCell({ leading, title, subtitle }: { leading?: ReactNode; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {leading}
      <div className="min-w-0">
        <div className="truncate font-medium text-a-text">{title}</div>
        {subtitle && <div className="truncate text-xs text-a-muted">{subtitle}</div>}
      </div>
    </div>
  );
}

/** 表格行末尾的一组操作。 */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">{children}</div>;
}

/** 列表为空时的占位：一个灰色图标、一句话、一句提示。 */
export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <Icon size={26} strokeWidth={1.4} className="text-a-muted/70" />
      <p className="mt-3 text-a-text">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs leading-relaxed text-a-muted">{hint}</p>}
    </div>
  );
}

// ---- 表单 ------------------------------------------------------------------

/** 表单里的一个字段：标签、输入控件、可选的说明。 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-a-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-a-muted">{hint}</span>}
    </label>
  );
}

/** 一行"名称：内容"，像文档工具里页面的属性。 */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[6.5rem_1fr] sm:gap-4">
      <dt className="text-a-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// ---- 时间 ------------------------------------------------------------------

export const formatTime = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const formatDay = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

/** "3 分钟前"这样的相对时间，超过一周就显示日期。 */
export function formatRelative(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const seconds = Math.round((now.getTime() - new Date(d).getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} 天前`;
  return formatDay(d);
}

// ---- 加载和数字 ------------------------------------------------------------

/** 页面加载时的占位：和真实页面形状相近的灰色块，带一道缓慢扫过的光。 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="正在加载">
      <div className="mb-9">
        <div className="admin-skeleton h-8 w-36 rounded-md" />
        <div className="admin-skeleton mt-3 h-4 w-96 max-w-full rounded" />
      </div>
      <div className="border-t border-a-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-a-border py-3">
            <div className="admin-skeleton size-4 rounded" />
            <div className="admin-skeleton h-4 flex-1 rounded" />
            <div className="admin-skeleton h-4 w-20 rounded" />
            <div className="admin-skeleton h-4 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 从 0 滚动到目标值的数字。纯样式实现，不需要脚本；读屏软件读到的是最终的数。 */
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`admin-count ${className}`} style={{ "--n": value } as CSSProperties} role="img" aria-label={String(value)} />;
}
