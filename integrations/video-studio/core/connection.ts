import { eq } from "drizzle-orm";
import type { Actor } from "../../../src/core/actor";
import type { Db } from "../../../src/core/db/client";
import { studioConnection } from "./schema";
import { forbidden, invalid } from "../../../src/core/errors";
import { decryptSecret, encryptSecret } from "../../../src/core/secrets";

export function studioSiteUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw invalid("请填写完整的站点地址，例如 https://blog.example.com。"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw invalid("请填写站点根地址，不要包含账号、参数或 /admin、/mcp 路径。");
  return url.origin;
}

export class StudioConnection {
  constructor(private db: Db, private directory: string, initial: { url: string; token: string }) {
    if (!db.select().from(studioConnection).get()) {
      const url = initial.url.trim() ? studioSiteUrl(initial.url) : "";
      if (!url && initial.token) throw invalid("配置站点访问密钥时，请同时填写站点根地址。");
      db.insert(studioConnection).values({ id: 1, url, token: encryptSecret(initial.token, directory) }).run();
    }
  }
  read() {
    const row = this.db.select().from(studioConnection).where(eq(studioConnection.id, 1)).get()!;
    const token = decryptSecret(row.token, this.directory);
    if (token === null) throw invalid("站点密钥无法解密，请在工坊设置中重新填写，或者留空。");
    return { url: row.url, token };
  }
  public() {
    const row = this.db.select().from(studioConnection).where(eq(studioConnection.id, 1)).get()!;
    return { galley: row.url, hasToken: !!decryptSecret(row.token, this.directory) };
  }
  candidate(actor: Actor, url: string, token: string) {
    if (actor.kind !== "owner") throw forbidden("只有站长可以修改连接站点。");
    const normalized = studioSiteUrl(url);
    const saved = this.db.select().from(studioConnection).where(eq(studioConnection.id, 1)).get()!;
    // 密钥是选填的：演示结构公开，不用密钥也能读。切换站点时不沿用原站点的密钥
    const key = token.trim() || (normalized === saved.url ? decryptSecret(saved.token, this.directory) ?? "" : "");
    return { url: normalized, token: key };
  }
  save(actor: Actor, connection: { url: string; token: string }) {
    if (actor.kind !== "owner") throw forbidden("只有站长可以修改连接站点。");
    this.db.update(studioConnection).set({ url: studioSiteUrl(connection.url), token: encryptSecret(connection.token, this.directory) }).where(eq(studioConnection.id, 1)).run();
    return this.public();
  }
}
