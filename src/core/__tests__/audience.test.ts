import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { messages, pageViews } from "../db/schema";
import { GalleyError } from "../errors";
import { plainText } from "../markup/text";
import { authenticateAgent, createAgent } from "../services/agents";
import { dayKey, operationStats, recordPageView, topPages, topReferrers, visitTrend } from "../services/analytics";
import { createBlock } from "../services/blocks";
import { decideChangeSet, openChangeSet, submitChangeSet } from "../services/changeSets";
import { createDocumentAsOwner, getPublishedDocument, listPublished, publishedSlugExists, saveDocument } from "../services/documents";
import { countNewMessages, deleteMessage, listMessages, setMessageStatus, submitMessage } from "../services/messages";
import { searchPublished } from "../services/search";
import { claimTopic, createTopic } from "../services/topics";

let db: Db;
let agent: Actor;

function expectError(fn: () => unknown, code: GalleyError["code"], pattern?: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GalleyError);
    expect((e as GalleyError).code).toBe(code);
    if (pattern) expect((e as GalleyError).message).toMatch(pattern);
    return;
  }
  throw new Error("预期会抛出错误，但没有");
}

function publish(slug: string, title: string, body: string, summary = "") {
  const cs = openChangeSet(db, agent, { kind: "article", title: `新文章：${slug}` });
  const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title, summary, body });
  if (!saved.saved) throw new Error(`保存失败：${JSON.stringify(saved.issues)}`);
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return saved.documentId;
}

beforeEach(() => {
  db = openDb(":memory:");
  agent = authenticateAgent(db, createAgent(db, OWNER, "测试 Agent").token)!;
});

describe("留言", () => {
  const from = (n: number) => ({ fingerprint: `10.0.0.${n}|browser` });

  it("任何人可以留言，只有站长能看", () => {
    submitMessage(db, { ...from(1), name: " 读者 ", contact: "reader@example.com", body: "文章写得很清楚。", fromPath: "/posts/some-post" });
    expectError(() => listMessages(db, agent), "forbidden", /只有站长/);
    expectError(() => countNewMessages(db, agent), "forbidden");
    const [message] = listMessages(db, OWNER);
    expect(message).toMatchObject({ name: "读者", contact: "reader@example.com", body: "文章写得很清楚。", fromPath: "/posts/some-post", status: "new" });
    // 不保存提交者的地址，只保存一个看不出原文的标记。
    expect(message.senderHash).not.toContain("10.0.0.1");
    expect(countNewMessages(db, OWNER)).toBe(1);
  });

  it("隐藏字段被填了的是自动提交：看起来收下了，其实不保存", () => {
    expect(submitMessage(db, { ...from(1), body: "买药吗", trap: "http://spam.example" })).toEqual({ accepted: true, stored: false });
    expect(listMessages(db, OWNER)).toHaveLength(0);
  });

  it("拒绝空内容、过长的内容，丢掉不像站内路径的来源", () => {
    expectError(() => submitMessage(db, { ...from(1), body: "  " }), "invalid");
    expectError(() => submitMessage(db, { ...from(1), body: "字".repeat(2001) }), "invalid", /最多 2000/);
    submitMessage(db, { ...from(1), body: "正常的留言", fromPath: "https://evil.example/<script>" });
    expect(listMessages(db, OWNER)[0].fromPath).toBeNull();
  });

  it("同一个人短时间里只能留三条，别人不受影响", () => {
    for (let i = 0; i < 3; i++) submitMessage(db, { ...from(1), body: `第 ${i + 1} 条` });
    expectError(() => submitMessage(db, { ...from(1), body: "第 4 条" }), "invalid", /过一会儿/);
    submitMessage(db, { ...from(2), body: "另一个人的留言" });
    expect(listMessages(db, OWNER)).toHaveLength(4);
  });

  it("站长可以标为已读和删除，Agent 不行", () => {
    submitMessage(db, { ...from(1), body: "一条留言" });
    const [message] = listMessages(db, OWNER);
    expectError(() => setMessageStatus(db, agent, message.id, "read"), "forbidden");
    setMessageStatus(db, OWNER, message.id, "read");
    expect(countNewMessages(db, OWNER)).toBe(0);
    expect(listMessages(db, OWNER, { status: ["read"] })).toHaveLength(1);
    expectError(() => deleteMessage(db, agent, message.id), "forbidden");
    deleteMessage(db, OWNER, message.id);
    expect(db.select().from(messages).all()).toHaveLength(0);
  });
});

describe("站内搜索", () => {
  it("只在已发布的文章里找，标题命中的排在前面", () => {
    publish("body-hit", "排版笔记", "正文里提到了缓存这个词。");
    publish("title-hit", "缓存为什么不刷新", "讲一次排查的经过。");
    const cs = openChangeSet(db, agent, { kind: "article", title: "没发布的" });
    saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "draft", title: "缓存草稿", body: "还没发布。" });

    expect(searchPublished(db, "缓存").map((r) => r.slug)).toEqual(["title-hit", "body-hit"]);
    expect(searchPublished(db, "  ")).toEqual([]);
    expect(searchPublished(db, "完全没有的词")).toEqual([]);
  });

  it("多个词要同时出现；摘录取命中位置附近的文字，不带标记", () => {
    const cs = openChangeSet(db, agent, { kind: "knowledge", title: "整理" });
    const block = createBlock(db, agent, { changeSetId: cs.id, type: "opinion", title: "观点", body: "我认为后台要耐看。" });
    if (!block.created) throw new Error("没有创建成功");
    submitChangeSet(db, agent, cs.id);
    decideChangeSet(db, OWNER, cs.id, "approve");
    publish("design", "后台设计", `前面有一段铺垫。:cite[后台要耐看]{b=${block.blockId}}，不要抢眼。`);
    publish("other", "别的文章", "只提到了后台。");

    const results = searchPublished(db, "后台 耐看");
    expect(results.map((r) => r.slug)).toEqual(["design"]);
    expect(results[0].snippet).toContain("后台要耐看，不要抢眼");
    expect(results[0].snippet).not.toContain(":cite");
  });

  it("还原显示文字时去掉标记、图片和链接地址", () => {
    expect(plainText("见 [文档](https://example.com/doc)，![图](/media/a.png) 用 :value{b=abcd1234 key=n} 个。")).toBe("见 文档， 用 个。");
    expect(plainText(":::callout{type=tip}\n提示内容\n:::").trim()).toBe("提示内容");
  });
});

describe("站长新建文章和页面", () => {
  it("保存后立即上线；页面不出现在文章列表里", () => {
    const page = createDocumentAsOwner(db, OWNER, { kind: "page", slug: "about", title: "关于", body: "我是这个站的站长。" });
    expect(page.saved).toBe(true);
    expect(getPublishedDocument(db, "about")?.kind).toBe("page");
    expect(publishedSlugExists(db, "about", "page")).toBe(true);
    // 页面不是文章：文章的网址下找不到它，文章列表里也没有它。
    expect(publishedSlugExists(db, "about")).toBe(false);
    expect(listPublished(db)).toHaveLength(0);

    createDocumentAsOwner(db, OWNER, { kind: "article", slug: "by-owner", title: "站长写的", body: "正文。" });
    expect(listPublished(db).map((p) => p.slug)).toEqual(["by-owner"]);
  });

  it("Agent 不能直接发布；正文有错误或网址重复时什么都不留下", () => {
    expectError(() => createDocumentAsOwner(db, agent, { kind: "page", slug: "about", title: "关于", body: "x" }), "forbidden");
    const bad = createDocumentAsOwner(db, OWNER, { kind: "page", slug: "about", title: "关于", body: ":cite[坏引用]{b=nope0000}" });
    expect(bad.saved).toBe(false);
    expect(getPublishedDocument(db, "about")).toBeUndefined();
    createDocumentAsOwner(db, OWNER, { kind: "page", slug: "about", title: "关于", body: "好的正文。" });
    expectError(() => createDocumentAsOwner(db, OWNER, { kind: "page", slug: "about", title: "又一个", body: "x" }), "conflict", /已被文档/);
  });
});

describe("访问统计", () => {
  const today = new Date(2026, 10, 12, 10, 0, 0);
  const visit = (path: string, ip: string, extra: Partial<Parameters<typeof recordPageView>[1]> = {}) =>
    recordPageView(db, { path, ip, userAgent: "Mozilla/5.0 Safari", now: today, ...extra });

  it("同一位访客同一天看同一页只记一次；不保存地址", () => {
    expect(visit("/posts/a", "1.1.1.1").recorded).toBe(true);
    expect(visit("/posts/a", "1.1.1.1").recorded).toBe(false);
    expect(visit("/posts/a", "2.2.2.2").recorded).toBe(true);
    expect(visit("/posts/b", "1.1.1.1").recorded).toBe(true);
    const rows = db.select().from(pageViews).all();
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain("1.1.1.1");
  });

  it("不记自动程序的访问，也不记不认识的路径", () => {
    expect(visit("/posts/a", "1.1.1.1", { userAgent: "Googlebot/2.1" }).recorded).toBe(false);
    expect(visit("/posts/a", "1.1.1.1", { userAgent: "" }).recorded).toBe(false);
    expect(visit("/admin", "1.1.1.1").recorded).toBe(false);
    expect(visit("/posts/a?x=<script>", "1.1.1.1").recorded).toBe(false);
    expect(visit("/", "1.1.1.1").recorded).toBe(true);
  });

  it("换了一天，同一位访客的标记就对不上了", () => {
    visit("/posts/a", "1.1.1.1");
    const tomorrow = new Date(2026, 10, 13, 10, 0, 0);
    recordPageView(db, { path: "/posts/a", ip: "1.1.1.1", userAgent: "Mozilla/5.0 Safari", now: tomorrow });
    const [first, second] = db.select().from(pageViews).all();
    expect(first.visitor).not.toBe(second.visitor);
  });

  it("趋势补齐没有访问的日子；排行带上文章标题；来源不算本站自己", () => {
    publish("a", "文章甲", "正文。");
    visit("/posts/a", "1.1.1.1", { referrer: "https://www.example.org/some/page" });
    visit("/posts/a", "2.2.2.2", { referrer: "https://blog.test/posts/b", siteHost: "blog.test" });
    visit("/", "1.1.1.1");

    const trend = visitTrend(db, 7, today);
    expect(trend).toHaveLength(7);
    expect(trend.at(-1)).toEqual({ day: dayKey(today), visitors: 2, views: 3 });
    expect(trend[0]).toMatchObject({ visitors: 0, views: 0 });

    expect(topPages(db, 7, 10, today)).toEqual([
      { path: "/posts/a", title: "文章甲", views: 2 },
      { path: "/", title: "首页", views: 1 },
    ]);
    expect(topReferrers(db, 7, 10, today)).toEqual([{ referrer: "example.org", views: 1 }]);
  });
});

describe("Agent 运营数据", () => {
  it("一次通过和被打回过的分开统计；选题耗时只算已经写完的", () => {
    publish("first-pass", "一次通过", "正文。");

    const topic = createTopic(db, OWNER, { title: "一个选题" });
    const { changeSet } = claimTopic(db, agent, topic.id);
    const saved = saveDocument(db, agent, { changeSetId: changeSet.id, kind: "article", slug: "revised", title: "改过一次", body: "第一版。" });
    if (!saved.saved) throw new Error("保存失败");
    submitChangeSet(db, agent, changeSet.id);
    decideChangeSet(db, OWNER, changeSet.id, "reject", "重写");
    saveDocument(db, agent, { changeSetId: changeSet.id, documentId: saved.documentId, title: "改过一次", body: "第二版。" });
    submitChangeSet(db, agent, changeSet.id);
    decideChangeSet(db, OWNER, changeSet.id, "approve");

    const stats = operationStats(db, 4);
    expect(stats.review).toEqual({ approved: 2, firstPass: 1, revised: 1 });
    expect(stats.weekly).toHaveLength(4);
    expect(stats.weekly.at(-1)!.published).toBe(2);
    expect(stats.topics.finished).toBe(1);
    expect(stats.topics.averageLeadDays).toBeGreaterThanOrEqual(0);
  });

  it("没有数据时不报错", () => {
    const stats = operationStats(db);
    expect(stats.review).toEqual({ approved: 0, firstPass: 0, revised: 0 });
    expect(stats.topics.averageLeadDays).toBeNull();
  });
});
