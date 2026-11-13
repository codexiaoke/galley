"use client";

import { useRef, useState } from "react";
import { runInWorker, stopRunning } from "./run-client";
import type { RunOutput } from "./run-sandbox";

/**
 * 可以运行的代码块（```js run）下面的一条：「运行」「改一改」，以及运行的输出。
 *
 * 代码本身（带高亮的那份）由服务端渲染在上面；读者点「改一改」时把它换成一个可以编辑的文本框，
 * 改完再运行。运行在后台线程的沙箱里进行（run-client.ts → run-worker.ts → run-sandbox.ts），
 * 页面不会被卡住；那部分代码点了「运行」才下载。
 */
export function CodeRunner({ code }: { code: string }) {
  const original = code.replace(/\n$/, "");
  const ref = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(original);
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<RunOutput | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      setOutput(await runInWorker(source));
    } finally {
      setRunning(false);
    }
  };

  const toggleEdit = () => {
    const figure = ref.current?.closest("figure");
    const next = !editing;
    if (figure) figure.dataset.editing = next ? "true" : "false";
    setEditing(next);
  };

  return (
    <div ref={ref} className="galley-run">
      {editing && (
        <textarea
          className="galley-run-editor"
          value={source}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="编辑代码"
          rows={Math.min(24, Math.max(4, source.split("\n").length + 1))}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl + 回车 运行；Tab 插入两个空格，不跳出文本框
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (!running) void run();
            } else if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: start, selectionEnd: end } = el;
              setSource(source.slice(0, start) + "  " + source.slice(end));
              requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
            }
          }}
        />
      )}
      <div className="galley-run-bar">
        {running ? (
          // 跑的时候页面照常能用，按钮换成「停止」
          <button type="button" className="galley-run-button" data-running="true" onClick={stopRunning}>
            ■ 停止
          </button>
        ) : (
          <button type="button" className="galley-run-button" onClick={() => void run()}>
            ▶ 运行
          </button>
        )}
        <button type="button" onClick={toggleEdit} aria-pressed={editing}>
          {editing ? "收起编辑" : "改一改"}
        </button>
        {source !== original && !editing && <span className="galley-run-meta-inline">（运行的是改过的版本）</span>}
        {source !== original && (
          <button
            type="button"
            onClick={() => {
              setSource(original);
              setOutput(null);
            }}
          >
            恢复原样
          </button>
        )}
        {output && <span className="galley-run-meta">{output.error ? "出错了" : `用时 ${output.ms} 毫秒`}</span>}
      </div>
      {output && (
        <div className="galley-run-output" role="log" aria-live="polite">
          {output.lines.length === 0 && !output.error && <p className="galley-run-empty">（没有输出。用 console.log 打印想看的值。）</p>}
          {output.lines.map((line, i) => (
            <p key={i} data-level={line.level}>
              {line.level === "result" && <span aria-hidden="true">← </span>}
              {line.text}
            </p>
          ))}
          {output.truncated && <p className="galley-run-empty">（输出太多，只显示了前面一部分）</p>}
          {output.error && <p data-level="error">{output.error}</p>}
        </div>
      )}
    </div>
  );
}
