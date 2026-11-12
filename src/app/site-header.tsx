import Link from "next/link";
import { ViewTransition } from "react";
import { loadCategories } from "./data";
import { loadSite } from "./site";

/**
 * 前台每个页面顶部的一行：左边是网站名，右边是分类导航。
 * 导航里只列出有文章的分类，避免读者点进去是空的。
 */
export async function SiteHeader({ current }: { current?: string | null }) {
  const [site, all] = await Promise.all([loadSite(), loadCategories()]);
  const categories = all.filter((c) => c.publishedCount > 0 || c.slug === current);
  return (
    <header className="galley-header">
      <Link href="/" className="galley-sitename">
        {site.name}
      </Link>
      {categories.length > 0 && (
        <nav className="galley-nav" aria-label="分类">
          <Link href="/" aria-current={current === null ? "page" : undefined}>
            全部
            {current === null && <NavMarker />}
          </Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`} aria-current={c.slug === current ? "page" : undefined}>
              {c.name}
              {c.slug === current && <NavMarker />}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/**
 * 当前分类下面的朱红线。切换分类时它是同一个元素，
 * 所以会从原来的位置滑到新的位置，而不是一处消失、另一处出现。
 */
function NavMarker() {
  return (
    <ViewTransition name="nav-marker" share="slide-marker" default="none">
      <span className="galley-nav-marker" aria-hidden="true" />
    </ViewTransition>
  );
}
