"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * 可以一键复制的文字。
 *
 * - CopyBlock：单独占一块的版本，用在说明性的地方（接口地址、配置片段）。
 * - CopyInline：放在表格单元格里的紧凑版本，文字太长时在末尾省略，旁边一个小按钮。
 *
 * 两者的按钮都排在文字旁边，不盖在文字上面：盖在上面的话，文字一长就会被按钮压住。
 * 只有多行的配置片段例外，按钮放在右上角，文字右侧留出了它的位置。
 */

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 浏览器不允许写剪贴板时（比如不是安全的网址），什么都不做；文字本身仍然可以手动选中复制。
    }
  };
  return { copied, copy };
}

const BOX = "rounded-md bg-a-subtle/70 shadow-[inset_0_0_0_1px_var(--a-border)]";

/** 一段可以一键复制的文字：等宽字体显示，旁边是复制按钮，复制后变成对勾并显示"已复制"。 */
export function CopyBlock({ text, multiline = false }: { text: string; multiline?: boolean }) {
  const { copied, copy } = useCopy(text);
  const button = (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap transition-colors duration-100 ${
        copied ? "text-a-success" : "text-a-muted hover:bg-a-surface hover:text-a-text"
      }`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "已复制" : "复制"}
    </button>
  );

  if (multiline) {
    return (
      <div className={`relative ${BOX}`}>
        <pre className="overflow-x-auto py-2.5 pl-3.5 pr-24 font-mono text-xs leading-relaxed select-all">{text}</pre>
        <span className="absolute right-1.5 top-1.5">{button}</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-1 pr-1.5 ${BOX}`}>
      <pre className="min-w-0 flex-1 overflow-x-auto py-2.5 pl-3.5 font-mono text-xs leading-relaxed whitespace-nowrap select-all">{text}</pre>
      {button}
    </div>
  );
}

/** 表格里用的紧凑版本：宽度固定，文字超出时在末尾省略（鼠标停留可以看到全文），右边是一个只有图标的复制按钮。 */
export function CopyInline({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <div className={`flex w-64 items-center gap-0.5 pr-1 ${BOX}`}>
      <code title={text} className="min-w-0 flex-1 truncate py-1.5 pl-2.5 font-mono text-xs">
        {text}
      </code>
      <button
        type="button"
        onClick={copy}
        title={copied ? "已复制" : "复制"}
        aria-label={copied ? "已复制" : "复制"}
        className={`grid size-6 shrink-0 place-items-center rounded transition-colors duration-100 ${
          copied ? "text-a-success" : "text-a-muted hover:bg-a-surface hover:text-a-text"
        }`}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
