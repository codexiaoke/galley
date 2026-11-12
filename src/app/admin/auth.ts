import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { OWNER, type Actor } from "@/core/actor";

/**
 * 站长登录。只有一个管理员，密码通过环境变量 GALLEY_ADMIN_PASSWORD 配置。
 * 会话是一个带签名的过期时间，签名密钥由密码派生：改密码会让已有会话全部失效。
 */
const COOKIE = "galley_session";
const SESSION_DAYS = 14;

export const adminPassword = () => process.env.GALLEY_ADMIN_PASSWORD ?? "";

/** 密码至少 12 位才算已配置，避免用弱密码把后台暴露出去。 */
export const adminConfigured = () => adminPassword().length >= 12;

const sign = (value: string) => createHmac("sha256", `galley-session:${adminPassword()}`).update(value).digest("hex");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(input: string) {
  // 比较两边的签名而不是原文，长度固定，不泄露密码长度。
  return adminConfigured() && safeEqual(sign(`pw:${input}`), sign(`pw:${adminPassword()}`));
}

export async function startSession() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const store = await cookies();
  // 站点通过 HTTPS 访问时（前面的反向代理会在请求头里说明），cookie 只允许在 HTTPS 下发送。
  // 不能简单地按"是不是生产环境"来定：刚部署好、还没配 HTTPS 时用 http://服务器地址:3000 访问，
  // 浏览器会直接丢掉只允许 HTTPS 的 cookie，表现为密码正确却怎么也登录不上。
  const https = ((await headers()).get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
  store.set(COOKIE, `${expires}.${sign(String(expires))}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isOwner(): Promise<boolean> {
  // 必须先读取请求里的 cookie 并等待真实请求，再做任何判断：
  // 这样页面不会在构建或预取时被预渲染成固定结果，下面读取当前时间也才是安全的。
  const value = (await cookies()).get(COOKIE)?.value ?? "";
  await connection();
  if (!adminConfigured()) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature) return false;
  return safeEqual(signature, sign(expires)) && Number(expires) > Date.now();
}

/** 页面和操作都要调用它：未登录时跳转到登录页，已登录时返回站长身份。 */
export async function requireOwner(): Promise<Actor> {
  if (!(await isOwner())) redirect("/admin/login");
  return OWNER;
}

// 登录失败次数限制：每个进程内，每分钟最多 5 次。
const attempts: number[] = [];
export function loginAllowed(): boolean {
  const cutoff = Date.now() - 60_000;
  while (attempts.length && attempts[0] < cutoff) attempts.shift();
  return attempts.length < 5;
}
export const recordFailedLogin = () => void attempts.push(Date.now());
