import { Fragment } from "react";
import { describeDiff, diffText, foldDiff, type DiffLine } from "@/core/diff";

/**
 * 两版正文的对比。删掉的文字是红底加删除线，新增的是绿底；
 * 离改动远的段落收起来，只留一行说明，站长不用在没变的内容里找改动。
 */

/** 改动前后各保留几行没变的内容作为上下文。段落之间隔着空行，两行大致是一段。 */
const CONTEXT = 2;

const DEL = "rounded-[3px] bg-a-danger-soft text-a-danger line-through decoration-a-danger/50";
const ADD = "rounded-[3px] bg-a-success-soft text-a-success";

function Line({ line }: { line: DiffLine }) {
  if (line.kind === "same") return line.text.trim() ? <p className="text-a-muted">{line.text}</p> : <div className="h-2" />;
  if (line.kind === "change") {
    return (
      <p>
        {line.segments.map((segment, i) =>
          segment.kind === "same" ? <Fragment key={i}>{segment.text}</Fragment> : (
            <span key={i} className={segment.kind === "del" ? DEL : ADD}>
              {segment.text}
            </span>
          ),
        )}
      </p>
    );
  }
  if (!line.text.trim()) return null;
  return (
    <p>
      <span className={line.kind === "del" ? DEL : ADD}>{line.text}</span>
    </p>
  );
}

export function DiffView({ before, after }: { before: string; after: string }) {
  const { lines, changed } = diffText(before, after);
  if (!changed) return <p className="text-a-muted">内容没有变化。</p>;
  return (
    <div className="space-y-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
      {foldDiff(lines, CONTEXT).map((item) =>
        item.kind === "gap" ? (
          <p key={`gap-${item.index}`} className="my-1 select-none text-xs text-a-muted/70">
            ⋯ 这里有 {item.count} 段没有变化
          </p>
        ) : (
          <Line key={item.index} line={item.line} />
        ),
      )}
    </div>
  );
}

/** 一句话概括改动的规模，例如"增加 120 字，删去 30 字"。 */
export const diffSummary = (before: string, after: string) => describeDiff(diffText(before, after));
