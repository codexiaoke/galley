import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { authenticateAgent, createAgent } from "../services/agents";
import { applyOwnerChange, openChangeSet, submitChangeSet } from "../services/changeSets";
import { saveDocument } from "../services/documents";
import { submitMessage } from "../services/messages";
import { clearMailSettings, getMailSettings, resolveMailConfig, saveMailSettings } from "../services/mail";
import { composeMail, startNotifications, type Mail } from "../services/notify";
import { updateSiteSettings } from "../services/settings";
import { decryptSecret, encryptSecret } from "../secrets";

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

});

describe("邮件设置", () => {
  const smtp = { host: "smtp.example.com", port: "465", security: "ssl", user: "me@example.com", password: "app-password", to: "me@example.com" };
  let env: string | undefined;
  beforeEach(() => {
    // 测试里用固定的密钥，不在项目目录里生成密钥文件。
    env = process.env.GALLEY_SECRET_KEY;
    process.env.GALLEY_SECRET_KEY = "test-key";
  });
  afterEach(() => {
    if (env === undefined) delete process.env.GALLEY_SECRET_KEY;
    else process.env.GALLEY_SECRET_KEY = env;
  });

  it("后台填的设置可以发信；密码加密保存，读设置时拿不到密码", () => {
    expect(resolveMailConfig(db, {})).toBeNull();
    saveMailSettings(db, OWNER, smtp);
    const shown = getMailSettings(db);
    expect(shown).toMatchObject({ host: "smtp.example.com", port: 465, security: "ssl", user: "me@example.com", hasPassword: true, passwordUnreadable: false });
    expect(JSON.stringify(shown)).not.toContain("app-password");
    const stored = db.$client.prepare("select value from settings where key = 'smtp_pass'").get() as { value: string };
    expect(stored.value).not.toContain("app-password");

    const config = resolveMailConfig(db, {})!;
    expect(config.source).toBe("settings");
    expect(config.transport).toMatchObject({ host: "smtp.example.com", port: 465, secure: true, auth: { user: "me@example.com", pass: "app-password" } });
    expect(config.from).toBe("me@example.com");
  });

  it("密码留空表示不改；去掉用户名时密码一起去掉", () => {
    saveMailSettings(db, OWNER, smtp);
    saveMailSettings(db, OWNER, { ...smtp, password: "", port: "587", security: "starttls" });
    const config = resolveMailConfig(db, {})!;
    expect(config.transport).toMatchObject({ port: 587, secure: false, requireTLS: true, auth: { pass: "app-password" } });

    saveMailSettings(db, OWNER, { ...smtp, user: "", password: "" });
    expect(getMailSettings(db).hasPassword).toBe(false);
    expect(resolveMailConfig(db, {})!.transport).not.toHaveProperty("auth");
  });

  it("环境变量优先；密钥换了、密码解不开时不发信", () => {
    saveMailSettings(db, OWNER, smtp);
    const fromEnv = resolveMailConfig(db, { GALLEY_SMTP_URL: "smtps://u:secret@mail.example.org:465", GALLEY_NOTIFY_TO: "ops@example.org" })!;
    expect(fromEnv).toMatchObject({ source: "env", server: "mail.example.org:465", to: "ops@example.org" });

    process.env.GALLEY_SECRET_KEY = "another-key";
    expect(getMailSettings(db).passwordUnreadable).toBe(true);
    expect(resolveMailConfig(db, {})).toBeNull();
  });

  it("拒绝不合理的填写；只有站长能改", () => {
    const check = (patch: Partial<typeof smtp>, pattern: RegExp) => {
      expect(() => saveMailSettings(db, OWNER, { ...smtp, ...patch })).toThrow(pattern);
    };
    check({ host: "smtp://smtp.example.com" }, /不要带/);
    check({ port: "0" }, /端口/);
    check({ to: "not-an-email" }, /收通知的邮箱/);
    expect(() => saveMailSettings(db, OWNER, { ...smtp, from: "博客 <me@example.com>" })).not.toThrow();
    check({ from: "博客" } as Partial<typeof smtp>, /发件人/);
    expect(() => saveMailSettings(db, agent, smtp)).toThrow(/只有站长/);
    clearMailSettings(db, OWNER);
    expect(getMailSettings(db).host).toBe("");
  });
});

describe("机密的加密", () => {
  it("没有设置密钥时，在数据目录里生成一个只有自己能读的密钥文件", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "galley-secret-"));
    const saved = { dir: process.env.GALLEY_DATA_DIR, key: process.env.GALLEY_SECRET_KEY };
    process.env.GALLEY_DATA_DIR = dir;
    delete process.env.GALLEY_SECRET_KEY;
    try {
      const sealed = encryptSecret("密码");
      expect(decryptSecret(sealed)).toBe("密码");
      expect(fs.statSync(path.join(dir, ".secret-key")).mode & 0o777).toBe(0o600);
      // 被改过的内容解不开。
      expect(decryptSecret(sealed.slice(0, -4) + "AAAA")).toBeNull();
      expect(decryptSecret("not-sealed")).toBeNull();
    } finally {
      if (saved.dir === undefined) delete process.env.GALLEY_DATA_DIR;
      else process.env.GALLEY_DATA_DIR = saved.dir;
      if (saved.key !== undefined) process.env.GALLEY_SECRET_KEY = saved.key;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
