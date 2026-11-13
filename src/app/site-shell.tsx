import type { ReactNode } from "react";
import { loadSite } from "./site";

/**
 * 前台每个页面的最外层。站长选的主题挂在这里（data-theme），里面的配色、字体、版式都跟着变，
 * 对应 globals.css 里的 [data-theme] 一节；默认那套（书卷）不需要单独的样式。
 *
 * 为什么挂在这一层而不是 <html> 上：读主题要访问数据库，而数据库的读取必须等真实的请求
 * （见 data.ts 开头的说明）。挂到 <html> 就等于让根布局去等数据库，整站都不能再预渲染。
 * 挂在这里，外面那层 Suspense 的壳子仍然是静态的，主题跟着内容一起到。
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const site = await loadSite();
  return (
    <div className="galley-site flex-1" data-theme={site.theme}>
      {children}
    </div>
  );
}
