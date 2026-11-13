import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { describeDiff, diffText, foldDiff, type DiffLine } from "@/core/diff";
import { loadHistory } from "../../../data";
import { SimplePage } from "../../../simple-page";

/**
 * 一篇文章的修改记录：每一次上线是什么时候、为什么改、改了哪些字。
 * 读者能看到文章是怎么变成现在这样的，改错了的地方也藏不住。
 * 版本号、Agent、审阅几轮这些制作过程不在这里，在运营日志里。
 */
export default function HistoryPage({ params }: PageProps<"/posts/[slug]/history">) {
  return (
    <SimplePage title="修改记录">
      <Suspense fallback={null}>
        <History params={params} />
      </Suspense>
    </SimplePage>
  );
}

const formatDate = (d: Date) => {
  const date = new Date(d);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

function Line({ line }: { line: DiffLine }) {
  if (line.kind === "same") return line.text.trim() ? <p className="galley-diff-same">{line.text}</p> : null;
  if (line.kind === "change") {
    return (
      <p>
        {line.segments.map((s, i) =>
          s.kind === "same" ? <Fragment key={i}>{s.text}</Fragment> : s.kind === "del" ? <del key={i}>{s.text}</del> : <ins key={i}>{s.text}</ins>,
        )}
      </p>
    );
  }
  if (!line.text.trim()) return null;
  return <p>{line.kind === "del" ? <del>{line.text}</del> : <ins>{line.text}</ins>}</p>;
}

function Diff({ before, after }: { before: string; after: string }) {
  const { lines } = diffText(before, after);
  return (
    <div className="galley-diff">
      {foldDiff(lines).map((item) =>
        item.kind === "gap" ? (
          <p key={`gap-${item.index}`} className="galley-diff-gap">
            ⋯ {item.count} 段没有变化
          </p>
        ) : (
          <Line key={item.index} line={item.line} />
        ),
      )}
    </div>
  );
}

async function History({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const history = await loadHistory(slug);
  if (!history) notFound();
  const { revisions } = history;

  return (
    <>
      <p className="galley-lede">
        <Link href={`/posts/${history.slug}`}>{history.title}</Link> 上线以来的每一次修改，新的在前。
      </p>
      <ol className="galley-history">
        {revisions.map((rev, i) => {
          const previous = revisions[i + 1];
          const size = previous ? describeDiff({ added: rev.added, removed: rev.removed, changed: rev.body !== previous.body }) : undefined;
          return (
            <li key={rev.id} className="galley-history-entry">
              <time className="galley-history-date">{formatDate(rev.date)}</time>
              <p className="galley-history-note">{rev.note}</p>
              {previous && previous.title !== rev.title && (
                <p className="galley-history-size">
                  标题从「{previous.title}」改成「{rev.title}」
                </p>
              )}
              {size && <p className="galley-history-size">{size}</p>}
              {previous && rev.body !== previous.body && (
                <details className="galley-history-diff" open={i === 0}>
                  <summary>看改了哪些地方</summary>
                  <Diff before={previous.body} after={rev.body} />
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
