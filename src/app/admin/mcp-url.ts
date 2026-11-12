import { headers } from "next/headers";

/**
 * 这个站点的 MCP 地址。站点设置里填了网站地址就用它；没填时按这次访问的地址推算，
 * 站点前面有反向代理时，真实的域名和协议在 x-forwarded-* 请求头里。
 */
export async function siteMcpUrl(configuredUrl: string): Promise<string> {
  if (configuredUrl) return `${configuredUrl}/mcp`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/mcp`;
}
