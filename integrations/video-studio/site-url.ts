/** 数据里保留浏览器使用的站点地址；只有容器的后端请求改走宿主机。 */
export function studioFetchUrl(value: string) {
  const url = new URL(value);
  if (process.env.STUDIO_LOCAL_SITE_HOST && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.hostname = process.env.STUDIO_LOCAL_SITE_HOST;
  return url.toString();
}

/** 演示页只放和这份来源对得上的画面：有结构指纹按结构比，旧项目按内容指纹比 */
export function presentationCheck(url: URL, source: { version: string; structure?: string }) {
  if (source.structure) url.searchParams.set("structure", source.structure);
  else url.searchParams.set("version", source.version);
}
