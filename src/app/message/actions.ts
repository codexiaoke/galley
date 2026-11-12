"use server";

import { headers } from "next/headers";
import { getDb } from "@/core/db/client";
import { GalleyError } from "@/core/errors";
import { submitMessage } from "@/core/services/messages";

export type MessageState = { ok?: boolean; error?: string };

/** 读者提交留言。任何人都可以调用，所以频率限制和内容检查都在核心层里做。 */
export async function sendMessage(_prev: MessageState, formData: FormData): Promise<MessageState> {
  const text = (name: string) => String(formData.get(name) ?? "");
  const head = await headers();
  // 地址和浏览器标识只用来限制提交频率，保存的是它们的散列。
  const ip = (head.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  try {
    submitMessage(getDb(), {
      name: text("name"),
      contact: text("contact"),
      body: text("body"),
      fromPath: text("from"),
      trap: text("website"),
      fingerprint: `${ip}|${head.get("user-agent") ?? ""}`,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof GalleyError) return { error: e.message };
    throw e;
  }
}
