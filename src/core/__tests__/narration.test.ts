import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { removeNarration } from "../markup/narration";
import { prepareBody } from "../prepare";
import { authenticateAgent, createAgent } from "../services/agents";
import { openChangeSet } from "../services/changeSets";
import { saveDocument } from "../services/documents";

const SCENE = ':::scene{title="示意"}\n```js\nconst a = box("甲")\nstep("写给读者的。", () => {\n  say("讲的时候说的话。")\n  show(a)\n})\nstep("第二步。", () => { say(\'第二句\'); pulse(a) })\n```\n:::';
const BODY = `## 一节\n\n正文提到 say("这不是讲稿") 也照常留着。\n\n:::notes\n这一页的讲稿。\n:::\n\n${SCENE}\n\n收尾一句。`;

describe("讲稿归视频工坊：文章里不放讲稿", () => {
  it("摘掉 :::notes 和场景代码里的 say()，别的都不动", () => {
    const { body, removed } = removeNarration(BODY);
    expect(removed).toBe(3);
    expect(body).not.toMatch(/这一页的讲稿|讲的时候说的话|第二句|:::notes/);
    expect(body).toContain('正文提到 say("这不是讲稿") 也照常留着。');
    expect(body).toContain('step("写给读者的。", () => {\n  show(a)\n})');
    expect(body).toContain("收尾一句。");
    expect(body).not.toMatch(/\n{3,}/);
    // 没有讲稿的正文原样返回
    expect(removeNarration("## 一节\n\n正文。")).toEqual({ body: "## 一节\n\n正文。", removed: 0 });
  });

  let db: Db, agent: Actor;
  beforeEach(() => {
    db = openDb(":memory:");
    agent = authenticateAgent(db, createAgent(db, OWNER, "Codex").token)!;
  });

  it("保存时去掉讲稿并提醒一句，到工坊里写", async () => {
    await prepareBody(BODY);
    const cs = openChangeSet(db, agent, { kind: "article", title: "讲稿" });
    const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug: "narration", title: "讲稿", body: BODY });
    expect(saved.saved).toBe(true);
    expect(saved.issues.map((issue) => issue.message).join()).toMatch(/3 处讲稿.*视频工坊/);
    const row = db.$client.prepare("select body from document_revisions order by created_at desc limit 1").get() as { body: string };
    expect(row.body).toBe(removeNarration(BODY).body);
  });
});
