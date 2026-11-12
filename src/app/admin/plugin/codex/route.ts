import { getDb } from "@/core/db/client";
import { codexPluginArchive } from "@/core/plugin";
import { getSiteSettings } from "@/core/services/settings";
import { isOwner } from "../../auth";
import { siteMcpUrl } from "../../mcp-url";

/** 下载预先填好本站地址的 Codex 插件。插件里没有访问密钥。 */
export async function GET() {
  if (!(await isOwner())) return new Response("请先登录后台。", { status: 401 });
  const site = getSiteSettings(getDb());
  const { filename, archive } = codexPluginArchive({ mcpUrl: await siteMcpUrl(site.url), siteName: site.name });
  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
