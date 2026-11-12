import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** 读者访问了不存在的网址时看到的页面。和前台的其他页面是同一个样子。 */
export default function NotFound() {
  return (
    <div className="galley-site flex-1">
      <main className="galley-page pb-20">
        <Suspense fallback={null}>
          <SiteHeader />
        </Suspense>
        <article className="galley-article">
          <title>没有找到这一页</title>
          <header className="galley-article-header">
            <h1 className="galley-title">没有找到这一页</h1>
          </header>
          <div className="galley-prose">
            <p>这个网址下没有内容。可能是链接写错了，也可能是文章已经下线。</p>
            <p>
              <Link href="/">回到首页</Link>
            </p>
          </div>
        </article>
        <Suspense fallback={null}>
          <SiteFooter />
        </Suspense>
      </main>
    </div>
  );
}
