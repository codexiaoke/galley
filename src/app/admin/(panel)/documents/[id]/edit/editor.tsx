"use client";

import { ArrowLeft, CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import type { MarkupIssue } from "@/core/markup/parse";
import type { BlockView } from "@/core/services/blocks";
import { Markdown } from "@/render/Markdown";
import { previewBody, saveDocumentEdit } from "../../../../actions";
import { Select } from "../../../../select";
import { useToast } from "../../../../toast";
import { Badge, buttonClass } from "../../../../ui";

type Preview = { body: string; issues: MarkupIssue[]; blocks: Record<string, BlockView> };

/** 正文写到一半时可能出现渲染不了的内容。预览出错不应该让整个编辑器跟着崩掉。 */
class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="text-a-muted">这段内容暂时预览不了，继续写完再看。</p> : this.props.children;
  }
}

/** 没有边框的输入框：像文档工具那样直接在页面上写标题和摘要。 */
const BARE = "w-full resize-none bg-transparent placeholder:text-a-muted/60 focus:outline-none";

const HELP: [string, string][] = [
  [":cite[这句话]{b=知识块编号}", "给一句话挂上依据，读者悬停时能看到出处"],
  [":value{b=知识块编号 key=名称}", "插入知识块里的一个数值，知识块更新后自动跟着变"],
  ["::block{id=知识块编号}", "把整个知识块嵌进正文，比如一段代码"],
  [":::callout{type=tip}", "提示框，另起一行以 ::: 结束。type 可以是 info、tip、warning"],
  ["![说明](/media/文件名)", "插入图片。图片先传到媒体库，那里可以直接复制这一段写法"],
];

/**
 * 文章编辑器：左边改正文的源码，右边按前台的样子实时预览。
 *
 * 三种用法共用这一个界面：
 * - 直接修改已上线的文章（changeSetId 为空）：保存后立即生效，留下一个新版本。
 * - 在待审的改动里改稿（给出 changeSetId）：保存到那份稿子里，批准后才上线。
 * - 站长自己新建（isNew）：文章的网址别名可以填；"关于"页的网址是固定的。保存后立即上线。
 */
export function DocumentEditor({
  document,
  categories,
  changeSetId,
  isNew = false,
  backHref,
  initialPreview,
}: {
  document: { id: string; slug: string; kind: string; title: string; summary: string; category: string | null; body: string; revNo: number };
  categories: { slug: string; name: string }[];
  changeSetId?: string;
  isNew?: boolean;
  backHref: string;
  initialPreview: Omit<Preview, "body">;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(document.title);
  const [summary, setSummary] = useState(document.summary);
  const [body, setBody] = useState(document.body);
  const [preview, setPreview] = useState<Preview>({ body: document.body, ...initialPreview });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // 停止输入一小会儿之后再刷新预览。只采用最后一次请求的结果，避免旧结果盖掉新结果。
  const latest = useRef(0);
  useEffect(() => {
    if (body === preview.body) return;
    const timer = setTimeout(async () => {
      const request = ++latest.current;
      const result = await previewBody(body, changeSetId);
      if (request === latest.current) setPreview({ body, ...result });
    }, 400);
    return () => clearTimeout(timer);
  }, [body, preview.body, changeSetId]);

  // 有没保存的修改时，关闭或刷新页面前提醒一下。
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () => {
    const form = formRef.current;
    if (!form || saving) return;
    startSaving(async () => {
      const result = await saveDocumentEdit({}, new FormData(form));
      if (result.ok) {
        setDirty(false);
        toast(changeSetId ? "已保存到这份稿子里" : isNew ? "已发布" : "已保存，修改已经上线");
        router.push(backHref);
        return;
      }
      setError(result.error);
      if (result.issues) setPreview((p) => ({ ...p, issues: result.issues! }));
    });
  };

  const errors = preview.issues.filter((i) => i.level === "error");
  const warnings = preview.issues.filter((i) => i.level === "warning");
  const edited = () => {
    setDirty(true);
    setError(undefined);
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      // ⌘S / Ctrl+S 保存
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          save();
        }
      }}
    >
      <input type="hidden" name="id" value={document.id} />
      {changeSetId && <input type="hidden" name="cs" value={changeSetId} />}
      {isNew && <input type="hidden" name="kind" value={document.kind} />}
      {isNew && document.kind === "page" && <input type="hidden" name="slug" value={document.slug} />}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-a-muted transition-colors hover:bg-a-subtle hover:text-a-text">
          <ArrowLeft size={15} />
          {changeSetId ? "返回这份改动" : "返回文章列表"}
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-a-muted">{dirty ? "有未保存的修改" : isNew ? "" : `第 ${document.revNo} 版`}</span>
          <button disabled={saving || !dirty} className={buttonClass("primary")}>
            {saving && <LoaderCircle size={15} className="animate-spin" />}
            {changeSetId ? "保存到稿子里" : isNew ? "发布" : "保存并上线"}
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        {changeSetId ? (
          <Badge tone="blue">待审的稿子</Badge>
        ) : isNew ? (
          <Badge tone="purple">{document.kind === "page" ? "新页面" : "新文章"}</Badge>
        ) : (
          <Badge tone="green">{document.kind === "page" ? "已上线的页面" : "已上线的文章"}</Badge>
        )}
        <span className="text-xs text-a-muted">
          {changeSetId ? "修改会保存到这份待审的稿子里，你批准之后才上线。" : isNew ? "你自己写的内容不经过审阅，点「发布」后立即上线。" : "保存后立即生效，不经过审阅，会留下一个新版本。"}
        </span>
      </div>

      <input
        name="title"
        required
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          edited();
        }}
        placeholder="标题"
        className={`${BARE} text-[2rem] font-bold leading-tight tracking-tight`}
      />
      <textarea
        name="summary"
        value={summary}
        onChange={(e) => {
          setSummary(e.target.value);
          edited();
        }}
        rows={1}
        placeholder="摘要：显示在首页的文章列表里，一两句话"
        className={`${BARE} mt-2 leading-relaxed text-a-muted`}
        style={{ fieldSizing: "content" } as CSSProperties}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-a-border pb-4">
        {document.kind === "article" && categories.length > 0 && (
          <label className="flex items-center gap-2">
            <span className="text-xs text-a-muted">分类</span>
            <span onClick={edited}>
              <Select name="category" ariaLabel="分类" defaultValue={document.category ?? ""} options={categories.map((c) => ({ value: c.slug, label: c.name }))} className="w-40" />
            </span>
          </label>
        )}
        {isNew && document.kind === "article" ? (
          <label className="flex items-center gap-2">
            <span className="text-xs text-a-muted">网址 /posts/</span>
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="只能用小写字母、数字和连字符，例如 my-first-post"
              placeholder="my-first-post"
              onChange={edited}
              className="w-56 rounded-md bg-a-subtle/70 px-2.5 py-1 font-mono text-xs shadow-[inset_0_0_0_1px_var(--a-border)] focus:bg-a-surface focus:shadow-[inset_0_0_0_1px_var(--a-primary),0_0_0_3px_var(--a-primary-soft)] focus:outline-none"
            />
          </label>
        ) : (
          <span className="text-xs text-a-muted">
            网址 <span className="ml-1 font-mono">{document.kind === "page" ? `/${document.slug}` : `/posts/${document.slug}`}</span>
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-xs text-a-muted">正文</p>
          <textarea
            name="body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              edited();
            }}
            spellCheck={false}
            className="block min-h-[30rem] w-full resize-y rounded-md bg-a-subtle/70 p-4 font-mono text-[13px] leading-[1.75] text-a-text shadow-[inset_0_0_0_1px_var(--a-border)] transition-shadow duration-100 focus:bg-a-surface focus:shadow-[inset_0_0_0_1px_var(--a-primary),0_0_0_3px_var(--a-primary-soft)] focus:outline-none"
            style={{ fieldSizing: "content" } as CSSProperties}
          />

          {error && <p className="mt-3 rounded-md bg-a-danger-soft px-3 py-2 text-a-danger">{error}</p>}
          {preview.issues.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {[...errors, ...warnings].map((issue, i) => (
                <li key={i} className={`flex items-start gap-2 ${issue.level === "error" ? "text-a-danger" : "text-a-warning"}`}>
                  {issue.level === "error" ? <CircleAlert size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
                  <span>
                    {issue.line ? `第 ${issue.line} 行：` : ""}
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-a-muted hover:text-a-text">正文里的标记怎么写</summary>
            <dl className="mt-2 space-y-2">
              {HELP.map(([syntax, meaning]) => (
                <div key={syntax}>
                  <dt className="font-mono text-xs">{syntax}</dt>
                  <dd className="text-xs text-a-muted">{meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-a-muted">
              知识块的编号在
              <Link href="/admin/blocks" target="_blank" className="mx-0.5 text-a-primary hover:underline">
                知识块
              </Link>
              页面里，每一行标题下面那串字符就是。其余按普通的 Markdown 写。
            </p>
          </details>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <p className="mb-2 flex items-center gap-2 text-xs text-a-muted">
            预览
            {body !== preview.body && <LoaderCircle size={12} className="animate-spin" />}
          </p>
          {/* 预览按前台的样子显示：纸张底色和宋体，和读者看到的一致 */}
          <div className="galley-site rounded-lg border border-a-border bg-paper px-6 py-7 text-ink xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
            <PreviewBoundary key={preview.body}>
              <Markdown body={preview.body} blocks={preview.blocks} review />
            </PreviewBoundary>
          </div>
        </div>
      </div>
    </form>
  );
}
