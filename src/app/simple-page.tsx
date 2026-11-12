import { Suspense, type ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { loadSite } from "./site";

/** 浏览器标签上的标题：页面名加网站名。网站名来自数据库，所以单独等它。 */
async function TabTitle({ title }: { title: string }) {
  const site = await loadSite();
  return <title>{`${title} · ${site.name}`}</title>;
}

/**
 * 留言、搜索这类简单页面共用的版面：和文章页一样的栏宽，顶部是网站名和导航，
 * 然后是标题和内容，最后是页脚。
 */
export function SimplePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="galley-site flex-1">
      <main className="galley-page pb-12">
        <Suspense fallback={null}>
          <SiteHeader />
        </Suspense>
        <article className="galley-article">
          <Suspense fallback={null}>
            <TabTitle title={title} />
          </Suspense>
          <header className="galley-article-header">
            <h1 className="galley-title">{title}</h1>
          </header>
          {children}
        </article>
        <Suspense fallback={null}>
          <SiteFooter />
        </Suspense>
      </main>
    </div>
  );
}
