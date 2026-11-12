import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { Suspense } from "react";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={`${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Suspense fallback={null}>
          <WaitForRequest />
        </Suspense>
      </body>
    </html>
  );
}
