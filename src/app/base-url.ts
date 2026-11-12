import type { SiteSettings } from "@/core/services/settings";

/**
 * 订阅源、站点地图里的链接要写完整的网址，这里决定它们以什么开头。
 * 站长在"站点设置"里填了网站地址就用它；没填时用这次访问的地址。
 * 站点前面有反向代理时，真实的域名和协议在 x-forwarded-* 请求头里。
 */
export function baseUrl(request: Request, site: SiteSettings): string {
  if (site.url) return site.url;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** 把文字放进 XML 之前转义。 */
export const xml = (text: string) =>
  text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
