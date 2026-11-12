"use client";

import { LoaderCircle, MessageSquarePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { addReviewComment, changeReviewComment } from "../../../actions";
import { useToast } from "../../../toast";
import { buttonClass, INPUT } from "../../../ui";

/**
 * 行内批注。
 *
 * - Commentable：包住一段可以批注的内容。选中文字后出现"批注"按钮，写下意见保存。
 *   已有的批注会在原文上标出底色。
 * - CommentAction：批注列表里的小操作（重新打开、标为已处理）。
 * - CommentQuote：批注列表里引用的原文，点一下滚动到正文里对应的位置。
 */

export type Anchor = { exact: string; prefix?: string; suffix?: string } | null;
type Marked = { id: string; anchor: Anchor; status: "open" | "resolved" };

const squash = (text: string) => text.replace(/\s+/g, "");

/**
 * 在容器里找到批注针对的那段文字，返回它的范围。
 *
 * 比较时忽略所有空白：选中文字时浏览器会在段落之间加换行，而页面的文字节点里没有，
 * 不忽略的话跨段落的批注就找不到原文了。
 */
function locate(container: HTMLElement, anchor: NonNullable<Anchor>): Range | undefined {
  const chars: { node: Text; offset: number }[] = [];
  let flat = "";
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    // 写批注的小面板也在容器里，它的文字不算正文。
    if (node.parentElement?.closest("[data-comment-ui]")) continue;
    const text = node.data;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      chars.push({ node, offset: i });
      flat += text[i];
    }
  }
  const needle = squash(anchor.exact);
  if (!needle) return undefined;
  const prefix = squash(anchor.prefix ?? "");
  // 同一段文字出现多次时，用它前面的文字区分是哪一处。
  let at = -1;
  for (let from = flat.indexOf(needle); from !== -1; from = flat.indexOf(needle, from + 1)) {
    if (at === -1) at = from;
    if (prefix && flat.slice(0, from).endsWith(prefix)) {
      at = from;
      break;
    }
  }
  if (at === -1) return undefined;
  const first = chars[at];
  const last = chars[at + needle.length - 1];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

/** 页面上所有批注的范围。几个 Commentable 共用同一组高亮，所以放在组件外面统一登记。 */
const located = new Map<string, { range: Range; open: boolean }>();

function paint() {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const open = [...located.values()].filter((m) => m.open).map((m) => m.range);
  const done = [...located.values()].filter((m) => !m.open).map((m) => m.range);
  CSS.highlights.set("galley-comment", new Highlight(...open));
  CSS.highlights.set("galley-comment-done", new Highlight(...done));
}

type Draft = { quote: string; prefix: string; suffix: string; top: number; left: number; range: Range };

/**
 * 正在写批注的那段文字。输入框拿到焦点后浏览器会取消选区，
 * 这里另外给它标上底色，站长写的时候还能看到自己批注的是哪一段。
 */
function paintDraft(range?: Range) {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  if (range) CSS.highlights.set("galley-comment-draft", new Highlight(range));
  else CSS.highlights.delete("galley-comment-draft");
}

export function Commentable({
  changeSetId,
  targetType,
  targetRevisionId,
  comments,
  enabled,
  children,
}: {
  changeSetId: string;
  targetType: "document" | "block";
  targetRevisionId: string;
  comments: Marked[];
  /** 只有待审的改动可以写新批注；其余状态下只标出已有的 */
  enabled: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft>();
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // 把已有的批注标到原文上。内容每次重新渲染后都要重新找一遍位置。
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const mine: string[] = [];
    for (const comment of comments) {
      const range = comment.anchor ? locate(container, comment.anchor) : undefined;
      if (!range) continue;
      located.set(comment.id, { range, open: comment.status === "open" });
      mine.push(comment.id);
    }
    paint();
    return () => {
      for (const id of mine) located.delete(id);
      paint();
    };
  });

  useEffect(() => {
    paintDraft(composing ? draft?.range : undefined);
    return () => paintDraft();
  }, [composing, draft]);

  const onSelect = useCallback(() => {
    const container = ref.current;
    if (!enabled || composing || !container) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return setDraft(undefined);
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return setDraft(undefined);
    const quote = selection.toString().trim();
    if (!quote) return setDraft(undefined);

    const before = document.createRange();
    before.selectNodeContents(container);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange();
    after.selectNodeContents(container);
    after.setStart(range.endContainer, range.endOffset);

    const rect = range.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    setDraft({
      quote: quote.slice(0, 500),
      prefix: before.toString().slice(-32),
      suffix: after.toString().slice(0, 32),
      top: rect.bottom - box.top + 6,
      // 面板宽 18rem，别让它伸到容器外面去。
      left: Math.max(0, Math.min(rect.left - box.left, box.width - 288)),
      range: range.cloneRange(),
    });
  }, [enabled, composing]);

  const close = () => {
    setDraft(undefined);
    setComposing(false);
    setError(undefined);
  };

  const submit = (data: FormData) =>
    startTransition(async () => {
      const result = await addReviewComment({}, data);
      if (!result.ok) return setError(result.error ?? "没有保存成功。");
      window.getSelection()?.removeAllRanges();
      close();
      toast("批注已添加");
    });

  return (
    <div ref={ref} className="relative" onMouseUp={onSelect} onKeyUp={onSelect}>
      {children}
      {draft && (
        <div data-comment-ui className="absolute z-20 font-sans" style={{ top: draft.top, left: draft.left }}>
          {composing ? (
            <form
              className="admin-pop w-72 rounded-lg bg-a-surface p-3 text-sm text-a-text shadow-[0_0_0_1px_rgb(15_15_15/0.08),0_6px_20px_rgb(15_15_15/0.14)]"
              onSubmit={(e) => {
                e.preventDefault();
                submit(new FormData(e.currentTarget));
              }}
            >
              <input type="hidden" name="changeSetId" value={changeSetId} />
              <input type="hidden" name="targetType" value={targetType} />
              <input type="hidden" name="targetRevisionId" value={targetRevisionId} />
              <input type="hidden" name="quote" value={draft.quote} />
              <input type="hidden" name="prefix" value={draft.prefix} />
              <input type="hidden" name="suffix" value={draft.suffix} />
              <p className="mb-2 line-clamp-2 border-l-2 border-a-border pl-2 text-xs text-a-muted">{draft.quote}</p>
              <textarea
                name="body"
                required
                autoFocus
                rows={3}
                placeholder="这里要怎么改？"
                className={`${INPUT} resize-none`}
                // ⌘Enter / Ctrl+Enter 保存，Esc 取消
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
                  if (e.key === "Escape") close();
                }}
              />
              {error && <p className="mt-2 text-xs text-a-danger">{error}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={close} className={buttonClass("secondary")}>
                  取消
                </button>
                <button disabled={pending} className={buttonClass("primary")}>
                  {pending && <LoaderCircle size={14} className="animate-spin" />}
                  保存
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              // 按下时不让浏览器取消选区，否则按钮一点，选中的文字就没了。
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setComposing(true)}
              className="admin-pop inline-flex items-center gap-1.5 rounded-md bg-a-text px-2.5 py-1.5 text-xs font-medium text-a-surface shadow-[0_4px_14px_rgb(15_15_15/0.2)]"
            >
              <MessageSquarePlus size={14} />
              批注
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 批注列表里引用的原文。点一下，正文滚动到这段文字的位置。 */
export function CommentQuote({ id, children }: { id: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title="在正文里找到这段文字"
      onClick={() => {
        const target = located.get(id)?.range.startContainer.parentElement;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className="line-clamp-3 w-full border-l-2 border-a-border pl-2 text-left text-xs leading-relaxed text-a-muted transition-colors hover:border-a-primary hover:text-a-text"
    >
      {children}
    </button>
  );
}

/** 批注上的小操作：重新打开、标为已处理。点一下直接生效。 */
export function CommentAction({ id, op, successMessage, children }: { id: string; op: "reopen" | "resolve"; successMessage: string; children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const data = new FormData();
          data.set("id", id);
          data.set("op", op);
          const result = await changeReviewComment({}, data);
          if (result.ok) toast(successMessage);
        })
      }
      className={buttonClass("link")}
    >
      {children}
    </button>
  );
}
