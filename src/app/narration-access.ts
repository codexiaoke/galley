import { getDb } from "@/core/db/client";
import { authenticateAgent } from "@/core/services/agents";
import { isOwner } from "./admin/auth";

/**
 * 讲稿相关的接口（narration.json）谁能读。
 *
 * 讲稿不公开，所以要认人：带上接入密钥（Authorization: Bearer <密钥>，和 MCP 用的是同一种，
 * 后台"MCP 管理"里建），或者是登录了后台的站长。
 *
 * 做视频的工具是另一个网页，会跨域请求，所以这些接口允许跨域。认的是请求里带的密钥，
 * 不是浏览器自动带上的登录状态，跨域放开不会让别的网站借站长的身份读到讲稿。
 */
export const NARRATION_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Max-Age": "600",
};

export const narrationPreflight = () => new Response(null, { status: 204, headers: NARRATION_CORS });

export async function canReadNarration(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  return token ? !!authenticateAgent(getDb(), token) : isOwner();
}

export const narrationDenied = () =>
  Response.json({ error: "讲稿不公开。请求时带上接入密钥：Authorization: Bearer <密钥>。" }, { status: 401, headers: { ...NARRATION_CORS, "WWW-Authenticate": "Bearer" } });
