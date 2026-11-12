"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** 一段可以一键复制的文字：等宽字体显示，右上角是复制按钮，复制后变成对勾并显示"已复制"。 */
export function CopyBlock({ text, multiline = false }: { text: string; multiline?: boolean }) {
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

  return (
    <div className="group relative rounded-md bg-a-subtle/70 shadow-[inset_0_0_0_1px_var(--a-border)]">
      <pre className={`overflow-x-auto py-2.5 pl-3.5 pr-24 font-mono text-xs leading-relaxed select-all ${multiline ? "" : "whitespace-nowrap"}`}>{text}</pre>
      <button
        type="button"
        onClick={copy}
        className={`absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors duration-100 ${
          copied ? "text-a-success" : "text-a-muted hover:bg-a-surface hover:text-a-text"
        }`}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "已复制" : "复制"}
      </button>
    </div>
  );
}
