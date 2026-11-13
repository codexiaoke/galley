"use client";

import { useState } from "react";

/** 代码框右上角的复制按钮。复制后短暂显示"已复制"。 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 不是安全网址时浏览器不让写剪贴板，读者仍然可以手动选中复制。
    }
  };
  return (
    <button type="button" onClick={copy} className="galley-code-copy" data-copied={copied || undefined} aria-live="polite">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        {copied ? (
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <rect x="5" y="5" width="8.5" height="8.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10h.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </>
        )}
      </svg>
      <span>{copied ? "已复制" : "复制"}</span>
    </button>
  );
}
