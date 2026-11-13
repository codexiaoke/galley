import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { Suspense } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";
import { loadSite } from "./site";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  return {
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.description || `${site.name}的个人博客`,
    // 让浏览器和阅读器能自动发现订阅源。
    alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: site.name }] } },
  };
}

/**
 * 不显示任何东西，只是告诉框架：这个页面有一部分要等真实的请求。
 * 网站名来自数据库，所以页面标题只能在请求时确定；没有这个标记的话，
 * 其余部分都是固定内容的页面（比如 404 页）会在构建时报错。
 */
async function WaitForRequest() {
  await connection();
  return null;
}

/**
 * 页面一打开就用上读者在"阅读设置"里的选择，避免先闪一下默认的样子。
 * 作用和 reader-settings.tsx 里的 apply 一样，只是要在页面显示之前运行，所以写成一段内联的小脚本。
 * 后台不受影响。
 */
const APPLY_READER_SETTINGS = `try{if(!location.pathname.startsWith("/admin")){var s=JSON.parse(localStorage.getItem("galley-reader")||"{}"),d=document.documentElement;if(s.size==="s"||s.size==="l")d.dataset.readerSize=s.size;if(s.theme==="light"||s.theme==="dark")d.dataset.readerTheme=s.theme}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 根元素上的阅读设置由上面的脚本在浏览器里加上，和服务端渲染的不一样是正常的。
    <html lang="zh-CN" className={`${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_READER_SETTINGS }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Suspense fallback={null}>
          <WaitForRequest />
        </Suspense>
      </body>
    </html>
  );
}
