import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { revalidateTag } from "next/cache";
import { getDb } from "@/core/db/client";
import { authenticateAgent } from "@/core/services/agents";
import { createMcpServer } from "@/mcp/server";
import { PUBLIC_CONTENT_TAG } from "../data";

const rpcError = (status: number, message: string, headers?: HeadersInit) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });

/**
 * MCP 端点。无状态：每个请求创建一个服务实例，用访问密钥认证。
 * 密钥通过 Authorization: Bearer <密钥> 传入。
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const db = getDb();
  const actor = token ? authenticateAgent(db, token) : null;
  if (!actor) {
    return rpcError(401, "访问密钥无效或已停用。", { "WWW-Authenticate": "Bearer" });
  }

  const server = createMcpServer(db, actor, {
    // 不能用 "max"：那是先把旧内容发出去、后台再更新，Agent 发布后第一个来的读者和视频工坊会拿到旧版。
    // 路由处理函数里用不了 updateTag，按 Next.js 文档传 { expire: 0 }，让下一次请求直接拿到新内容。
    onPublicChange: () => revalidateTag(PUBLIC_CONTENT_TAG, { expire: 0 }),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export function GET() {
  return rpcError(405, "这个端点只接受 POST 请求。", { Allow: "POST" });
}

export function DELETE() {
  return rpcError(405, "这个端点只接受 POST 请求。", { Allow: "POST" });
}
