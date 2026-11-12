import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { messages, type MessageStatus } from "../db/schema";
import { forbidden, invalid, notFound } from "../errors";
import { emitEvent } from "../events";
import { newId } from "../ids";

/**
 * 读者给站长的留言（需求文档 5.10）。
 *
 * 任何人都可以提交；只有站长能读。MCP 接口里没有、也不应该有读取留言的工具。
 */

export type Message = typeof messages.$inferSelect;

const MAX_BODY = 2000;
/** 同一个提交者在这段时间里最多留几条。 */
const PER_SENDER = { windowMs: 10 * 60 * 1000, limit: 3 };
/** 全站在这段时间里最多收几条，防止被人换着地址灌。 */
const SITE_WIDE = { windowMs: 60 * 60 * 1000, limit: 40 };

/** 把提交者的地址等信息变成一个看不出原文的标记。只用于限制频率。 */
export const senderHashOf = (fingerprint: string) => createHash("sha256").update(`galley-message:${fingerprint}`).digest("hex").slice(0, 32);

export type SubmitMessageInput = {
  name?: string;
  contact?: string;
  body: string;
  fromPath?: string;
  /** 表单里的隐藏字段。真人看不到它，不会填；自动提交的程序往往会把所有字段都填上 */
  trap?: string;
  /** 提交者的地址和浏览器标识，只用来限制频率 */
  fingerprint: string;
};

/**
 * 提交一条留言。返回 accepted 表示"收下了"。
 * 被隐藏字段识别出来的自动提交也返回 accepted，但不保存：不告诉对方被识破了，它就不会换个办法再试。
 */
export function submitMessage(db: Db, input: SubmitMessageInput): { accepted: true; stored: boolean } {
  if (input.trap?.trim()) return { accepted: true, stored: false };
  const body = input.body.trim();
  if (!body) throw invalid("留言的内容不能为空。");
  if ([...body].length > MAX_BODY) throw invalid(`留言最多 ${MAX_BODY} 个字。`);

  const now = Date.now();
  const senderHash = senderHashOf(input.fingerprint);
  const recentBySender = db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.senderHash, senderHash), gt(messages.createdAt, new Date(now - PER_SENDER.windowMs))))
    .all().length;
  if (recentBySender >= PER_SENDER.limit) throw invalid("你刚才已经留过几条了，过一会儿再来吧。");
  const recentSiteWide = db
    .select({ id: messages.id })
    .from(messages)
    .where(gt(messages.createdAt, new Date(now - SITE_WIDE.windowMs)))
    .all().length;
  if (recentSiteWide >= SITE_WIDE.limit) throw invalid("现在留言的人有点多，过一会儿再来吧。");

  // 只接受站内的路径，其余的丢掉：这个值会显示在后台，不能让人塞进任意内容。
  const fromPath = input.fromPath && /^\/[A-Za-z0-9\-_/]{0,120}$/.test(input.fromPath) ? input.fromPath : null;
  const id = newId();
  db.insert(messages)
    .values({
      id,
      name: (input.name ?? "").trim().slice(0, 40),
      contact: (input.contact ?? "").trim().slice(0, 100),
      body,
      fromPath,
      status: "new",
      senderHash,
      createdAt: new Date(now),
    })
    .run();
  emitEvent({ type: "message_received", messageId: id, name: (input.name ?? "").trim().slice(0, 40), body, fromPath });
  return { accepted: true, stored: true };
}

function requireOwner(actor: Actor) {
  if (actor.kind !== "owner") throw forbidden("留言只有站长可以查看和处理。");
}

export function listMessages(db: Db, actor: Actor, filter: { status?: MessageStatus[] } = {}): Message[] {
  requireOwner(actor);
  return db
    .select()
    .from(messages)
    .where(filter.status ? inArray(messages.status, filter.status) : undefined)
    .orderBy(desc(messages.createdAt))
    .all();
}

export function countNewMessages(db: Db, actor: Actor): number {
  requireOwner(actor);
  return db.select({ id: messages.id }).from(messages).where(eq(messages.status, "new")).all().length;
}

export function setMessageStatus(db: Db, actor: Actor, id: string, status: MessageStatus) {
  requireOwner(actor);
  const result = db.update(messages).set({ status }).where(eq(messages.id, id)).run();
  if (result.changes === 0) throw notFound("这条留言不存在。");
}

export function deleteMessage(db: Db, actor: Actor, id: string) {
  requireOwner(actor);
  const result = db.delete(messages).where(eq(messages.id, id)).run();
  if (result.changes === 0) throw notFound("这条留言不存在。");
}
