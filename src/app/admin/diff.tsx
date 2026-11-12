import { Fragment } from "react";
import { diffText, type DiffLine } from "@/core/diff";

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

  // 每一行离最近的改动有多远，决定它显示还是收起。
  const near = lines.map(() => false);
  lines.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(lines.length - 1, i + CONTEXT); k++) near[k] = true;
  });

  const out: React.ReactNode[] = [];
  let hidden = 0;
  const flush = (key: number) => {
    if (hidden > 0) {
      out.push(
        <p key={`gap-${key}`} className="my-1 select-none text-xs text-a-muted/70">
          ⋯ 这里有 {hidden} 段没有变化
        </p>,
      );
    }
    hidden = 0;
  };
  lines.forEach((line, i) => {
    if (near[i]) {
      flush(i);
      out.push(<Line key={i} line={line} />);
    } else if (line.kind === "same" && line.text.trim()) {
      hidden++;
    }
  });
  flush(lines.length);

  return <div className="space-y-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{out}</div>;
}

/** 一句话概括改动的规模，例如"增加 120 字，删去 30 字"。 */
export function diffSummary(before: string, after: string): string | undefined {
  const { added, removed, changed } = diffText(before, after);
  if (!changed) return undefined;
  return [added > 0 && `增加 ${added} 字`, removed > 0 && `删去 ${removed} 字`].filter(Boolean).join("，") || "只调整了空行";
}
