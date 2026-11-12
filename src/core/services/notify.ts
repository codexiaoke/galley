import nodemailer from "nodemailer";
import type { Db } from "../db/client";
import { onEvent, type GalleyEvent } from "../events";
import { getSiteSettings } from "./settings";

/**
 * 邮件通知（需求文档 5.13）：有内容等站长审阅、有新留言时发邮件。
 *
 * 用标准的 SMTP，通过环境变量配置，不绑定邮件服务商：
 * - GALLEY_SMTP_URL：例如 smtps://用户名:密码@smtp.example.com:465
 * - GALLEY_NOTIFY_TO：收通知的邮箱
 * - GALLEY_MAIL_FROM：发件人，不填时用收件人
 *
 * 事情发生后先等几分钟再发，这段时间里的事合成一封：Agent 一轮运营可能连着提交好几项，不要连发好几封。
 */

export type MailConfig = { url: string; to: string; from: string };

export function mailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const url = env.GALLEY_SMTP_URL?.trim();
  const to = env.GALLEY_NOTIFY_TO?.trim();
  if (!url || !to) return null;
  return { url, to, from: env.GALLEY_MAIL_FROM?.trim() || to };
}

/** 给站长看的配置情况。SMTP 地址里有密码，只显示服务器的地址。 */
export function describeMailConfig(config: MailConfig | null) {
  if (!config) return null;
  let server = "";
  try {
    const parsed = new URL(config.url);
    server = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    server = "（地址格式不对）";
  }
  return { server, to: config.to, from: config.from };
}

export type Mail = { subject: string; text: string };
export type SendMail = (mail: Mail) => Promise<void>;

export function smtpSender(config: MailConfig): SendMail {
  const transport = nodemailer.createTransport(config.url);
  return async ({ subject, text }) => {
    await transport.sendMail({ from: config.from, to: config.to, subject, text });
  };
}

const plural = (n: number, unit: string) => `${n} ${unit}`;

/** 把一段时间里攒下的事写成一封邮件。 */
export function composeMail(events: GalleyEvent[], site: { name: string; url: string }): Mail {
  const reviews = events.filter((e) => e.type === "review_requested");
  const messages = events.filter((e) => e.type === "message_received");
  const link = (path: string) => (site.url ? `${site.url}${path}` : path);

  const parts: string[] = [];
  if (reviews.length) parts.push(`${plural(reviews.length, "项改动")}等你审阅`);
  if (messages.length) parts.push(`${plural(messages.length, "条新留言")}`);
  const subject = `[${site.name}] ${parts.join("，")}`;

  const lines: string[] = [];
  if (reviews.length) {
    lines.push("等你审阅：", "");
    for (const e of reviews) lines.push(`· ${e.title}${e.agentName ? `（${e.agentName}）` : ""}`, `  ${link(`/admin/change-sets/${e.changeSetId}`)}`);
    lines.push("");
  }
  if (messages.length) {
    lines.push("新留言：", "");
    for (const e of messages) {
      const preview = e.body.length > 200 ? `${e.body.slice(0, 200)}……` : e.body;
      lines.push(`· ${e.name || "没有署名"}${e.fromPath ? `，读了 ${e.fromPath} 之后` : ""}：`, `  ${preview.replace(/\n+/g, " ")}`);
    }
    lines.push("", `在后台查看全部留言：${link("/admin/messages")}`, "");
  }
  if (!site.url) lines.push("（在后台的「站点设置」里填上网站地址，这里的链接就能直接点开。）");
  lines.push("", "这封邮件由你的站点自动发出。不想收的话，可以在后台的「站点设置」里关掉。");
  return { subject, text: lines.join("\n") };
}

/**
 * 开始监听站点的事件，攒够一段时间后发一封邮件。返回一个函数，调用它停止监听。
 * 发送失败只记在日志里，不重试：通知是锦上添花，后台的看板上始终能看到全部待办。
 */
export function startNotifications(db: Db, send: SendMail, options: { delayMs?: number } = {}) {
  const delay = options.delayMs ?? 3 * 60 * 1000;
  let pending: GalleyEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    timer = undefined;
    const events = pending;
    pending = [];
    if (events.length === 0) return;
    try {
      const site = getSiteSettings(db);
      await send(composeMail(events, site));
    } catch (e) {
      console.error("[galley] 通知邮件没有发出去", e);
    }
  };

  const stop = onEvent((event) => {
    const settings = getSiteSettings(db);
    if (event.type === "review_requested" && settings.notifyReview !== "on") return;
    if (event.type === "message_received" && settings.notifyMessages !== "on") return;
    pending.push(event);
    timer ??= setTimeout(() => void flush(), delay);
  });

  return {
    stop: () => {
      stop();
      if (timer) clearTimeout(timer);
    },
    /** 立刻把攒着的发出去，测试用。 */
    flush,
  };
}
