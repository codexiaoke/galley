import { inArray } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { forbidden, invalid } from "../errors";
import { decryptSecret, encryptSecret } from "../secrets";

/**
 * 发通知邮件用的 SMTP 配置。
 *
 * 两种配置方式：
 * - 在后台的"站点设置"里填写，存在数据库里，密码加密保存（见 core/secrets.ts）；
 * - 用环境变量 GALLEY_SMTP_URL、GALLEY_NOTIFY_TO、GALLEY_MAIL_FROM。
 * 两种都有时以环境变量为准：用环境变量通常是部署的人想统一管理，后台不应该悄悄覆盖它。
 */

export type SmtpSecurity = "ssl" | "starttls" | "none";

/** 后台表单里看到的邮件设置。永远不带密码，只说有没有存过。 */
export type MailSettings = {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  hasPassword: boolean;
  /** 存过密码，但是解不开了（备份恢复到了另一台服务器，或者换了 GALLEY_SECRET_KEY） */
  passwordUnreadable: boolean;
  to: string;
  from: string;
};

/** 真正发信时用的配置。transport 直接交给 nodemailer。 */
export type MailConfig = {
  transport: string | { host: string; port: number; secure: boolean; requireTLS: boolean; ignoreTLS: boolean; auth?: { user: string; pass: string } };
  to: string;
  from: string;
  source: "env" | "settings";
  /** 给站长看的服务器地址，不含密码 */
  server: string;
};

const KEYS = {
  host: "smtp_host",
  port: "smtp_port",
  security: "smtp_security",
  user: "smtp_user",
  pass: "smtp_pass",
  to: "mail_to",
  from: "mail_from",
} as const;

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
/** 发件人可以只写邮箱，也可以写成 "名字 <邮箱>" */
const SENDER = /^(?:[^<>]{1,60}\s*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

function readRaw(db: Db): Map<string, string> {
  return new Map(
    db
      .select()
      .from(settings)
      .where(inArray(settings.key, Object.values(KEYS)))
      .all()
      .map((row) => [row.key, row.value]),
  );
}

export function getMailSettings(db: Db): MailSettings {
  const raw = readRaw(db);
  const security = raw.get(KEYS.security);
  const stored = raw.get(KEYS.pass) ?? "";
  return {
    host: raw.get(KEYS.host) ?? "",
    port: Number(raw.get(KEYS.port)) || 465,
    security: security === "starttls" || security === "none" ? security : "ssl",
    user: raw.get(KEYS.user) ?? "",
    hasPassword: !!stored,
    passwordUnreadable: !!stored && decryptSecret(stored) === null,
    to: raw.get(KEYS.to) ?? "",
    from: raw.get(KEYS.from) ?? "",
  };
}

export type SaveMailInput = {
  host: string;
  port: number | string;
  security: string;
  user: string;
  /** 新密码。留空表示不改，沿用已经存的 */
  password?: string;
  to: string;
  from?: string;
};

export function saveMailSettings(db: Db, actor: Actor, input: SaveMailInput): MailSettings {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改邮件设置。");
  const host = input.host.trim();
  if (!host || /[\s/:]/.test(host)) throw invalid("请填写 SMTP 服务器的地址，例如 smtp.qq.com，不要带 smtp:// 或端口。");
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw invalid("端口要是 1 到 65535 之间的数字，常见的是 465 或 587。");
  const security: SmtpSecurity = input.security === "starttls" || input.security === "none" ? input.security : "ssl";
  const to = input.to.trim();
  if (!EMAIL.test(to)) throw invalid("请填写一个收通知的邮箱。");
  const from = input.from?.trim() ?? "";
  if (from && !SENDER.test(from)) throw invalid("发件人要写成邮箱，或者「名字 <邮箱>」的形式。");
  const user = input.user.trim();
  const password = input.password ?? "";

  const values: [string, string][] = [
    [KEYS.host, host],
    [KEYS.port, String(port)],
    [KEYS.security, security],
    [KEYS.user, user],
    [KEYS.to, to],
    [KEYS.from, from],
  ];
  // 没填用户名就是不需要登录的服务器，原来存的密码也一并去掉。
  if (!user) values.push([KEYS.pass, ""]);
  else if (password) values.push([KEYS.pass, encryptSecret(password)]);

  db.transaction((tx) => {
    for (const [key, value] of values) {
      tx.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
    }
  });
  return getMailSettings(db);
}

/** 清除后台填的邮件设置。 */
export function clearMailSettings(db: Db, actor: Actor) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改邮件设置。");
  db.delete(settings).where(inArray(settings.key, Object.values(KEYS))).run();
}

/** 现在生效的发信配置：先看环境变量，再看后台填的。都没有时返回 null，不发邮件。 */
export function resolveMailConfig(db: Db, env: Record<string, string | undefined> = process.env): MailConfig | null {
  const url = env.GALLEY_SMTP_URL?.trim();
  const envTo = env.GALLEY_NOTIFY_TO?.trim();
  if (url && envTo) {
    let server = "";
    try {
      const parsed = new URL(url);
      server = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    } catch {
      server = "（地址格式不对）";
    }
    return { transport: url, to: envTo, from: env.GALLEY_MAIL_FROM?.trim() || envTo, source: "env", server };
  }

  const mail = getMailSettings(db);
  if (!mail.host || !mail.to) return null;
  const pass = mail.user ? decryptSecret(readRaw(db).get(KEYS.pass) ?? "") : null;
  // 需要登录、但密码解不开时不发：用错的密码去连，只会让服务器把这个账号锁掉。
  if (mail.user && pass === null) return null;
  return {
    transport: {
      host: mail.host,
      port: mail.port,
      secure: mail.security === "ssl",
      requireTLS: mail.security === "starttls",
      ignoreTLS: mail.security === "none",
      ...(mail.user ? { auth: { user: mail.user, pass: pass! } } : {}),
    },
    to: mail.to,
    from: mail.from || mail.to,
    source: "settings",
    server: `${mail.host}:${mail.port}`,
  };
}
