import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { authenticateAgent, createAgent } from "../services/agents";
import { applyOwnerChange, openChangeSet, submitChangeSet } from "../services/changeSets";
import { saveDocument } from "../services/documents";
import { submitMessage } from "../services/messages";
import { composeMail, describeMailConfig, mailConfig, startNotifications, type Mail } from "../services/notify";
import { updateSiteSettings } from "../services/settings";

let db: Db;
let agent: Actor;
let sent: Mail[];
let notifier: ReturnType<typeof startNotifications>;

function submitArticle(slug: string) {
  const cs = openChangeSet(db, agent, { kind: "article", title: `新文章：${slug}` });
  saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title: slug, body: "正文。" });
  submitChangeSet(db, agent, cs.id);
  return cs.id;
}

beforeEach(() => {
  db = openDb(":memory:");
  agent = authenticateAgent(db, createAgent(db, OWNER, "Codex").token)!;
  sent = [];
  // 很长的等待：测试里由 flush 手动发出，不依赖计时。
  notifier = startNotifications(db, async (mail) => void sent.push(mail), { delayMs: 60_000 });
});

afterEach(() => notifier.stop());

describe("邮件通知", () => {
  it("一段时间里的待审和留言合成一封邮件", async () => {
    updateSiteSettings(db, OWNER, { name: "程序员小柯", url: "https://blog.example.com" });
    const first = submitArticle("one");
    submitArticle("two");
    submitMessage(db, { fingerprint: "1.1.1.1|ua", name: "读者", body: "写得很好。", fromPath: "/posts/one" });
    await notifier.flush();

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("[程序员小柯] 2 项改动等你审阅，1 条新留言");
    expect(sent[0].text).toContain(`https://blog.example.com/admin/change-sets/${first}`);
    expect(sent[0].text).toContain("读者，读了 /posts/one 之后");
    expect(sent[0].text).toContain("写得很好。");

    // 发过之后清空，没有新的事就不再发。
    await notifier.flush();
    expect(sent).toHaveLength(1);
  });

  it("站长自己的直接修改不通知；关掉的类别不通知", async () => {
    applyOwnerChange(db, OWNER, { kind: "article", title: "站长自己写的" }, (tx, changeSetId) =>
      saveDocument(tx, OWNER, { changeSetId, kind: "article", slug: "mine", title: "mine", body: "正文。" }),
    );
    updateSiteSettings(db, OWNER, { notifyMessages: "off" });
    submitMessage(db, { fingerprint: "1.1.1.1|ua", body: "一条留言" });
    await notifier.flush();
    expect(sent).toHaveLength(0);

    updateSiteSettings(db, OWNER, { notifyReview: "off" });
    submitArticle("quiet");
    await notifier.flush();
    expect(sent).toHaveLength(0);
  });

  it("发送失败不影响提交本身", async () => {
    notifier.stop();
    notifier = startNotifications(db, async () => {
      throw new Error("SMTP 连不上");
    });
    const id = submitArticle("still-works");
    await notifier.flush();
    expect(db.$client.prepare("select status from change_sets where id = ?").get(id)).toEqual({ status: "in_review" });
  });

  it("没填网站地址时，邮件里提醒去填", () => {
    const mail = composeMail([{ type: "review_requested", changeSetId: "abc", title: "新文章", agentName: null }], { name: "站", url: "" });
    expect(mail.text).toContain("/admin/change-sets/abc");
    expect(mail.text).toContain("填上网站地址");
  });

  it("配置：缺收件人就不开启；展示时不露出密码", () => {
    expect(mailConfig({ GALLEY_SMTP_URL: "smtps://u:p@smtp.example.com:465" })).toBeNull();
    const config = mailConfig({ GALLEY_SMTP_URL: "smtps://user:secret@smtp.example.com:465", GALLEY_NOTIFY_TO: "me@example.com" })!;
    expect(config.from).toBe("me@example.com");
    const shown = describeMailConfig(config)!;
    expect(shown).toEqual({ server: "smtp.example.com:465", to: "me@example.com", from: "me@example.com" });
    expect(JSON.stringify(shown)).not.toContain("secret");
  });
});
