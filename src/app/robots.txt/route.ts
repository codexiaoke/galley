import { baseUrl } from "../base-url";
import { loadSite } from "../site";

/** 告诉搜索引擎：前台都可以抓取，后台和 MCP 接口不要抓；并给出站点地图的位置。 */
export async function GET(request: Request) {
  const base = baseUrl(request, await loadSite());
  const body = ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /mcp", "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
