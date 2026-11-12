import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { LogEntry } from "@/core/services/oplog";
import { loadOperationLog } from "../data";
import { SimplePage } from "../simple-page";
import { loadSite } from "../site";
import { TrackView } from "../track-view";

/** 每一项改动的类别，用读者听得懂的话说。 */
const KIND: Record<string, string> = {
  article: "新文章",
  document_edit: "修改文章",
  page: "调整页面",
  knowledge: "整理资料",
  block_update: "更新资料",
};

const two = (n: number) => String(n).padStart(2, "0");

/**
 * 运营日志：这个站的每一次上线，做了什么、为什么。
 * 文章页上不出现"由哪个 Agent 写的、改了几轮"这些制作过程，它们都在这里。
 */
export default function LogPage() {
  return (
    <SimplePage title="运营日志">
      <Suspense fallback={null}>
        <Log />
      </Suspense>
    </SimplePage>
  );
}

function Entry({ entry }: { entry: LogEntry }) {
  const date = new Date(entry.decidedAt);
  const process = [entry.agentName ? `${entry.agentName} 起草` : "Agent 起草", entry.rejectCount > 0 ? `改了 ${entry.rejectCount} 轮后通过` : "一次通过"];
  if (entry.blockCount > 0) process.push(`${entry.blockCount} 条资料`);
  return (
    <li className="galley-log-entry">
      <time className="galley-log-date">{`${two(date.getMonth() + 1)}.${two(date.getDate())}`}</time>
      <div className="min-w-0">
        <p className="galley-log-title">
          <span className="galley-log-kind">{KIND[entry.kind] ?? "改动"}</span>
          {entry.title}
        </p>
        {entry.summary && <p className="galley-log-summary">{entry.summary}</p>}
        <p className="galley-log-meta">
          {process.join(" · ")}
          {entry.documents.map((doc) => (
            <Link key={doc.slug} href={doc.kind === "page" ? `/${doc.slug}` : `/posts/${doc.slug}`}>
              {doc.title}
            </Link>
          ))}
        </p>
      </div>
    </li>
  );
}

async function Log() {
  const [site, entries] = await Promise.all([loadSite(), loadOperationLog()]);
  if (site.showLog === "off") notFound();

  // 按月份分组，新的在前。
  const months = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const d = new Date(entry.decidedAt);
    const key = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
    months.set(key, [...(months.get(key) ?? []), entry]);
  }

  return (
    <>
      <p className="galley-lede">这里的文章由 Agent 起草，经我审阅后发布。每一次上线都记在这里：做了什么，为什么。</p>
      {entries.length === 0 ? (
        <p className="galley-empty">还没有记录。</p>
      ) : (
        [...months].map(([month, items]) => (
          <section key={month} className="galley-log-month">
            <h2>{month}</h2>
            <ul>
              {items.map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        ))
      )}
      <TrackView path="/log" />
    </>
  );
}
