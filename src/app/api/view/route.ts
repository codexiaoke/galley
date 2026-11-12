import { getDb } from "@/core/db/client";
import { recordPageView } from "@/core/services/analytics";
import { isOwner } from "../../admin/auth";

/**
 * 记一次页面访问。由前台页面里的 TrackView 调用。
 * 站长自己登录着后台时不计数，免得把自己检查页面的次数算成读者。
 */
export async function POST(request: Request) {
  let data: { path?: unknown; referrer?: unknown };
  try {
    data = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  if (typeof data.path !== "string" || (await isOwner())) return new Response(null, { status: 204 });
  // 站点前面有反向代理时，访客的真实地址在 x-forwarded-for 的第一段。地址只参与当天的散列，不保存。
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  recordPageView(getDb(), {
    path: data.path,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    referrer: typeof data.referrer === "string" ? data.referrer : undefined,
    siteHost: (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0],
  });
  return new Response(null, { status: 204 });
}
