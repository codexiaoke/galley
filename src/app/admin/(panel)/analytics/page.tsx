import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getDb } from "@/core/db/client";
import { operationStats, topPages, topReferrers, visitTrend } from "@/core/services/analytics";
import { requireOwner } from "../../auth";
import { PageHeader, PageSkeleton } from "../../ui";
import { ColumnChart } from "./charts";

const DAYS = 30;
const WEEKS = 8;

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Analytics />
    </Suspense>
  );
}

/** 一个数字：上面是说明，中间是数字，下面是补充。几个并排成一行，中间用细线隔开。 */
function Figure({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-a-muted">{label}</p>
      <p className="mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-a-muted">{hint}</p>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-4 mt-0.5 text-xs text-a-muted">{description}</p>
      {children}
    </section>
  );
}

/** 排行：每行是名称、一条横条和数字，横条从同一条线出发，长短可以直接比较。 */
function Ranked({ rows, empty }: { rows: { key: string; label: ReactNode; value: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-a-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate">{row.label}</span>
          <span className="tabular-nums text-a-muted">{row.value}</span>
          <span className="col-span-2 block h-1.5 rounded-full bg-a-subtle">
            <span className="block h-full rounded-full bg-a-primary" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 图下面可以展开的数据表：图上的每个数字在这里都能直接读到，不依赖鼠标悬停。 */
function DataTable({ head, rows }: { head: [string, string]; rows: [string, number][] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-a-muted hover:text-a-text">查看数据表</summary>
      <table className="mt-2 text-xs tabular-nums">
        <thead>
          <tr className="text-a-muted">
            <th className="py-1 pr-6 text-left font-normal">{head[0]}</th>
            <th className="py-1 text-right font-normal">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-a-border">
              <td className="py-1 pr-6">{label}</td>
              <td className="py-1 text-right">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const shortDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

async function Analytics() {
  await requireOwner();
  const db = getDb();
  const trend = visitTrend(db, DAYS);
  const pages = topPages(db, DAYS, 8);
  const referrers = topReferrers(db, DAYS, 8);
  const ops = operationStats(db, WEEKS);

  const visitors = trend.reduce((sum, d) => sum + d.visitors, 0);
  const views = trend.reduce((sum, d) => sum + d.views, 0);
  const publishedRecently = ops.weekly.reduce((sum, w) => sum + w.published, 0);
  const firstPassRate = ops.review.approved > 0 ? Math.round((ops.review.firstPass / ops.review.approved) * 100) : null;
  const lead = ops.topics.averageLeadDays;

  return (
    <>
      <PageHeader title="运营分析" description="读者看了什么，以及 Agent 这段时间干得怎么样。访问数据由站点自己记录，不使用 Cookie，不保存访客的地址。" />

      <div className="mb-10 grid grid-cols-2 divide-a-border rounded-lg border border-a-border max-xl:[&>*:nth-child(-n+2)]:border-b max-xl:[&>*:nth-child(odd)]:border-r xl:grid-cols-4 xl:divide-x [&>*]:border-a-border">
        <Figure label={`近 ${DAYS} 天访客`} value={visitors} hint="同一个人同一天只算一次" />
        <Figure label={`近 ${DAYS} 天浏览`} value={views} hint="读者打开页面的次数" />
        <Figure label="一次通过率" value={firstPassRate === null ? "—" : `${firstPassRate}%`} hint={ops.review.approved > 0 ? `近 90 天批准了 ${ops.review.approved} 项改动` : "近 90 天还没有批准过改动"} />
        <Figure label="选题到上线" value={lead === null ? "—" : lead < 1 ? "不到 1 天" : `${lead.toFixed(1)} 天`} hint={ops.topics.finished > 0 ? `近 90 天写完了 ${ops.topics.finished} 个选题` : "近 90 天还没有写完的选题"} />
      </div>

      <div className="space-y-12">
        <Section title="每天的访客" description={`最近 ${DAYS} 天。自动程序（搜索引擎的爬虫等）和你自己登录后台时的访问不算在内。`}>
          <ColumnChart
            unit="位访客"
            data={trend.map((d, i) => ({
              key: d.day,
              label: d.day,
              value: d.visitors,
              // 横轴只标每周一次，加上最后一天
              tick: i === trend.length - 1 || (trend.length - 1 - i) % 7 === 0 ? shortDay(d.day) : undefined,
            }))}
          />
          <DataTable head={["日期", "访客"]} rows={[...trend].reverse().map((d) => [d.day, d.visitors])} />
        </Section>

        <div className="grid gap-x-12 gap-y-12 xl:grid-cols-2">
          <Section title="看得最多的页面" description={`最近 ${DAYS} 天的浏览次数。`}>
            <Ranked
              empty="还没有访问记录。"
              rows={pages.map((p) => ({
                key: p.path,
                value: p.views,
                label: (
                  <Link href={p.path} target="_blank" className="hover:text-a-primary" title={p.path}>
                    {p.title}
                  </Link>
                ),
              }))}
            />
          </Section>
          <Section title="读者从哪里来" description={`最近 ${DAYS} 天从别的网站点过来的次数。直接输入网址、从收藏夹打开的不在这里。`}>
            <Ranked empty="还没有从别的网站过来的访问。" rows={referrers.map((r) => ({ key: r.referrer, label: r.referrer, value: r.views }))} />
          </Section>
        </div>

        <div className="grid gap-x-12 gap-y-12 xl:grid-cols-2">
          <Section title="每周上线的文章" description={`最近 ${WEEKS} 周，共 ${publishedRecently} 篇。每周从周一算起。`}>
            <ColumnChart
              unit="篇"
              height={132}
              data={ops.weekly.map((w) => ({ key: w.weekStart, label: `${w.weekStart} 这一周`, value: w.published, tick: shortDay(w.weekStart) }))}
            />
            <DataTable head={["周一的日期", "上线篇数"]} rows={[...ops.weekly].reverse().map((w) => [w.weekStart, w.published])} />
          </Section>
          <Section title="审阅结果" description="最近 90 天里 Agent 提交、最后获得批准的改动。">
            {ops.review.approved === 0 ? (
              <p className="py-6 text-a-muted">这段时间还没有批准过 Agent 的改动。</p>
            ) : (
              <>
                {/* 一个比例对着一个整体：用一条横条，底色是同一种颜色的浅色 */}
                <div className="flex items-baseline justify-between gap-4">
                  <span>
                    <span className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">{ops.review.firstPass}</span>
                    <span className="ml-1.5 text-a-muted">项一次通过</span>
                  </span>
                  <span className="text-a-muted">
                    <span className="tabular-nums text-a-text">{ops.review.revised}</span> 项被打回后改过才通过
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-a-primary-soft" role="img" aria-label={`一次通过率 ${firstPassRate}%`}>
                  <span className="block h-full rounded-full bg-a-primary" style={{ width: `${firstPassRate}%` }} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-a-muted">一次通过率低，说明技能里的要求和你的标准有差距：把常打回的原因写进技能，比每次在批注里重复更有效。</p>
              </>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
