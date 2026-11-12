import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db/client";
import { blockRevisions, categories, changeSets, documentRevisions, documents, pageViews, settings, topics } from "../db/schema";

/**
 * 运营分析（需求文档 5.11）：访问统计由程序自己记录，不接第三方服务，不使用 Cookie。
 */

const two = (n: number) => String(n).padStart(2, "0");

/** 日期的写法：2026-11-12，按服务器所在的时区。 */
export const dayKey = (date: Date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** 自动程序的浏览器标识里常见的字样。它们的访问不算读者。 */
const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|java\/|go-http|headless|lighthouse|facebookexternalhit|feedfetcher|rss|scrapy|httpclient/i;

/** 只记这几类页面的访问：首页、关于页、运营日志、文章页、分类页、标签页。别的路径一律不记，免得被人灌进垃圾数据。 */
const TRACKED = /^\/(about|log|posts\/[a-z0-9-]{1,120}|category\/[a-z0-9-]{1,120}|tag\/(?:%[0-9A-F]{2}|[A-Za-z0-9._~+-]){1,200})?$/;

const SALT_KEY = "visit_salt";

/**
 * 当天的盐。每天换一个新的随机值，旧的直接覆盖、不保留，
 * 所以过了今天就没有任何办法把访客标记还原或者和别的日子对上。
 */
function saltFor(db: Db, day: string): string {
  const stored = db.select().from(settings).where(eq(settings.key, SALT_KEY)).get()?.value;
  if (stored?.startsWith(`${day}:`)) return stored.slice(day.length + 1);
  const salt = randomBytes(16).toString("hex");
  const value = `${day}:${salt}`;
  db.insert(settings).values({ key: SALT_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
  return salt;
}

export type PageViewInput = {
  path: string;
  /** 访客的地址，只参与当天的散列，不保存 */
  ip: string;
  userAgent: string;
  /** 访客是从哪个网址过来的 */
  referrer?: string;
  /** 本站的域名：来源是本站自己时不算来源 */
  siteHost?: string;
  now?: Date;
};

/** 记一次访问。同一位访客同一天看同一个页面只记一次。 */
export function recordPageView(db: Db, input: PageViewInput): { recorded: boolean } {
  if (!TRACKED.test(input.path)) return { recorded: false };
  if (!input.userAgent || BOT.test(input.userAgent)) return { recorded: false };
  const now = input.now ?? new Date();
  const day = dayKey(now);
  const visitor = createHash("sha256").update(`${saltFor(db, day)}|${input.ip}|${input.userAgent}`).digest("hex").slice(0, 24);

  let referrer: string | null = null;
  if (input.referrer) {
    try {
      const host = new URL(input.referrer).hostname.replace(/^www\./, "");
      if (host && host !== input.siteHost?.replace(/^www\./, "")) referrer = host.slice(0, 100);
    } catch {
      // 不是合法的网址就当作没有来源。
    }
  }
  const result = db.insert(pageViews).values({ day, path: input.path, visitor, referrer, createdAt: now }).onConflictDoNothing().run();
  return { recorded: result.changes > 0 };
}

/** 最近若干天每天的访客数和浏览量，没有访问的日子补零，旧的在前。 */
export function visitTrend(db: Db, days = 30, today = new Date()): { day: string; visitors: number; views: number }[] {
  const since = dayKey(addDays(today, -(days - 1)));
  const rows = db
    .select({ day: pageViews.day, visitors: sql<number>`count(distinct ${pageViews.visitor})`, views: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.day, since))
    .groupBy(pageViews.day)
    .all();
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const day = dayKey(addDays(today, i - (days - 1)));
    return { day, visitors: byDay.get(day)?.visitors ?? 0, views: byDay.get(day)?.views ?? 0 };
  });
}

/** 最近若干天访问最多的页面。文章页带上文章的标题。 */
export function topPages(db: Db, days = 30, limit = 10, today = new Date()): { path: string; title: string; views: number }[] {
  const since = dayKey(addDays(today, -(days - 1)));
  const rows = db
    .select({ path: pageViews.path, views: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.day, since))
    .groupBy(pageViews.path)
    .orderBy(sql`count(*) desc`, pageViews.path)
    .limit(limit)
    .all();
  const slugs = rows.flatMap((r) => (r.path.startsWith("/posts/") ? [r.path.slice("/posts/".length)] : []));
  const titles = new Map(
    slugs.length === 0
      ? []
      : db
          .select({ slug: documents.slug, title: documentRevisions.title })
          .from(documents)
          .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
          .where(inArray(documents.slug, slugs))
          .all()
          .map((d) => [d.slug, d.title]),
  );
  const decode = (text: string) => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  };
  const label = (path: string) =>
    path === "/"
      ? "首页"
      : path === "/about"
        ? "关于"
        : path === "/log"
          ? "运营日志"
          : path.startsWith("/posts/")
            ? (titles.get(path.slice(7)) ?? path)
            : path.startsWith("/category/")
              ? `分类：${path.slice(10)}`
              : path.startsWith("/tag/")
                ? `标签：${decode(path.slice(5))}`
                : path;
  return rows.map((r) => ({ path: r.path, title: label(r.path), views: r.views }));
}

/** 最近若干天带来访客最多的外部网站。 */
export function topReferrers(db: Db, days = 30, limit = 8, today = new Date()): { referrer: string; views: number }[] {
  const since = dayKey(addDays(today, -(days - 1)));
  return db
    .select({ referrer: sql<string>`${pageViews.referrer}`, views: sql<number>`count(*)` })
    .from(pageViews)
    .where(and(gte(pageViews.day, since), isNotNull(pageViews.referrer)))
    .groupBy(pageViews.referrer)
    .orderBy(sql`count(*) desc`, pageViews.referrer)
    .limit(limit)
    .all();
}

/** 一周从周一开始。返回这一周周一的零点。 */
const weekStart = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));

/**
 * Agent 运营的几项数据：
 * - 最近几周每周上线了几篇文章；
 * - 最近 90 天里，Agent 提交并获批的改动有多少是一次通过的（中途没有被打回过）；
 * - 最近 90 天里，选题从提出到文章上线平均用了几天。
 */
export function operationStats(db: Db, weeks = 8, now = new Date()) {
  const firstWeek = addDays(weekStart(now), -7 * (weeks - 1));
  const published = db
    .select({ publishedAt: documents.publishedAt })
    .from(documents)
    .where(and(eq(documents.kind, "article"), isNotNull(documents.publishedAt), gte(documents.publishedAt, firstWeek)))
    .all();
  const weekly = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(firstWeek, 7 * i);
    const end = addDays(start, 7);
    return { weekStart: dayKey(start), published: published.filter((d) => d.publishedAt! >= start && d.publishedAt! < end).length };
  });

  const since = addDays(now, -90);
  const approved = db
    .select({ id: changeSets.id })
    .from(changeSets)
    .where(and(eq(changeSets.status, "approved"), eq(changeSets.createdByKind, "agent"), gte(changeSets.decidedAt, since)))
    .all()
    .map((c) => c.id);
  // 被打回过的改动，里面的版本会留下"打回时的正文"。
  const rejectedOnce = new Set<string>();
  if (approved.length > 0) {
    for (const table of [documentRevisions, blockRevisions]) {
      const rows = db
        .selectDistinct({ id: table.changeSetId })
        .from(table)
        .where(and(inArray(table.changeSetId, approved), isNotNull(table.rejectedBody)))
        .all();
      for (const row of rows) if (row.id) rejectedOnce.add(row.id);
    }
  }

  const finished = db
    .select({ createdAt: topics.createdAt, decidedAt: changeSets.decidedAt })
    .from(topics)
    .innerJoin(changeSets, eq(topics.changeSetId, changeSets.id))
    .where(and(eq(topics.status, "done"), gte(changeSets.decidedAt, since)))
    .all();
  const leadDays = finished.map((t) => (t.decidedAt!.getTime() - t.createdAt.getTime()) / 86_400_000);

  return {
    weekly,
    review: { approved: approved.length, firstPass: approved.length - rejectedOnce.size, revised: rejectedOnce.size },
    topics: { finished: finished.length, averageLeadDays: leadDays.length ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length : null },
  };
}

/**
 * 最近若干天，各分类、各标签下的文章一共被看了多少次（只算文章页的浏览）。
 * 文章按它现在的分类和标签归类。
 */
export function viewsByGroup(db: Db, days = 30, today = new Date()) {
  const since = dayKey(addDays(today, -(days - 1)));
  const views = new Map(
    db
      .select({ path: pageViews.path, views: sql<number>`count(*)` })
      .from(pageViews)
      .where(and(gte(pageViews.day, since), sql`${pageViews.path} like '/posts/%'`))
      .groupBy(pageViews.path)
      .all()
      .map((r) => [r.path.slice("/posts/".length), r.views]),
  );
  const docs = db
    .select({ slug: documents.slug, category: categories.name, tags: documentRevisions.tags })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .leftJoin(categories, eq(documentRevisions.categoryId, categories.id))
    .where(and(eq(documents.kind, "article"), eq(documents.status, "published")))
    .all();
  const byCategory = new Map<string, number>();
  const byTag = new Map<string, number>();
  for (const doc of docs) {
    const n = views.get(doc.slug) ?? 0;
    byCategory.set(doc.category ?? "未分类", (byCategory.get(doc.category ?? "未分类") ?? 0) + n);
    for (const tag of doc.tags) byTag.set(tag, (byTag.get(tag) ?? 0) + n);
  }
  const sorted = (m: Map<string, number>) => [...m].map(([name, views]) => ({ name, views })).sort((a, b) => b.views - a.views || a.name.localeCompare(b.name, "zh-CN"));
  return { categories: sorted(byCategory), tags: sorted(byTag) };
}
