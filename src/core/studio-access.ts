import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Actor } from "./actor";
import { forbidden } from "./errors";

const equal = (a: string, b: string) => { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };
export const STUDIO_COOKIE = "galley_studio_owner";
export const requireStudioOwner = (actor: Actor) => { if (actor.kind !== "owner") throw forbidden("此操作只允许站长在工坊管理界面执行。Agent 请使用已授权的 MCP 工具。"); };

/** 本机管理身份与 Agent 密钥分开；Agent 不能拿自己的密钥调用审查或授权接口。 */
export class StudioAccess {
  private readonly key: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, ".owner-key");
    if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 });
    this.key = readFileSync(file, "utf8").trim();
  }
  private sign(value: string) { return createHmac("sha256", this.key).update(value).digest("hex"); }
  login(token: string) {
    if (!equal(this.sign(token), this.sign(this.key))) return null;
    const expires = String(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return `${expires}.${this.sign(expires)}`;
  }
  isOwner(cookie: string) {
    const value = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${STUDIO_COOKIE}=`))?.slice(STUDIO_COOKIE.length + 1) ?? "";
    const [expires, signature] = value.split(".");
    return !!expires && !!signature && Number(expires) > Date.now() && equal(this.sign(expires), signature);
  }
}
