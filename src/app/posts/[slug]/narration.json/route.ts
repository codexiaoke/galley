import { getDb } from "@/core/db/client";
import { runScenes } from "@/core/scene/run";
import { authenticateAgent } from "@/core/services/agents";
import { narrationBeats } from "@/render/narration";
import { isOwner } from "../../../admin/auth";
import { loadPublishedDocument } from "../../../data";

/**
 * 一篇文章做成视频用的讲稿，按播放的顺序一拍一拍给出（见 render/narration.ts）。
 *
 * 给做视频的工具用：它拿每一拍的讲稿去配音，再把每一拍的时长通过演示页的 timing 参数传回来。
 *
 * 讲稿不公开（公开的幻灯片接口 present.json 里没有它），所以这个接口要认人：
 * 带上接入密钥（Authorization: Bearer <密钥>，和 MCP 用的是同一种，后台"MCP 管理"里建），
 * 或者是登录了后台的站长。工具是另一个网页时会跨域请求，所以允许跨域；
 * 认的是请求里带的密钥，不是浏览器自动带上的登录状态，跨域放开不会让别的网站借站长的身份读到讲稿。
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Max-Age": "600",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const allowed = token ? !!authenticateAgent(getDb(), token) : await isOwner();
  if (!allowed) {
    return Response.json({ error: "讲稿不公开。请求时带上接入密钥：Authorization: Bearer <密钥>。" }, { status: 401, headers: { ...CORS, "WWW-Authenticate": "Bearer" } });
  }
  const { slug } = await params;
  const doc = await loadPublishedDocument(slug);
  if (!doc || doc.kind !== "article") return Response.json({ error: "没有这篇文章。" }, { status: 404, headers: CORS });
  const beats = narrationBeats(doc.body, await runScenes(doc.body));
  return Response.json(
    {
      slug: doc.slug,
      title: doc.title,
      revisedAt: doc.revisedAt,
      /** 演示页的地址。把每一拍的时长拼成 timing=名字:毫秒,名字:毫秒 加在后面 */
      present: `/posts/${doc.slug}/present`,
      beats,
    },
    { headers: { ...CORS, "Cache-Control": "private, no-store" } },
  );
}
