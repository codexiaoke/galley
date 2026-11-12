import Link from "next/link";
import { loadHasAboutPage } from "./data";
import { loadSite } from "./site";

/**
 * 前台每个页面最底部的一行小字：关于、日志、留言、搜索、订阅。
 * 下面还可以有一段站长在站点设置里写的文字（版权声明、备案号之类），可以带一个链接。
 * 颜色很淡，不和正文抢注意力；读者读完想找它们的时候，它们在这里。
 * from 是当前页面的路径：读者从这里点"留言"时，站长能看到他是读了哪一页之后来的。
 */
export async function SiteFooter({ from }: { from?: string }) {
  const [hasAbout, site] = await Promise.all([loadHasAboutPage(), loadSite()]);
  return (
    <footer className="galley-footer">
      <nav aria-label="页脚">
        {hasAbout && <Link href="/about">关于</Link>}
        {site.showLog === "on" && <Link href="/log">日志</Link>}
        <Link href={from ? `/message?from=${encodeURIComponent(from)}` : "/message"}>留言</Link>
        <Link href="/search">搜索</Link>
        {/* 订阅源不是页面，用普通链接 */}
        <a href="/feed.xml">订阅</a>
      </nav>
      {site.footerText && (
        <p className="galley-footer-note">
          {site.footerUrl ? (
            // 站外的网址：新开一个窗口，不把本站的地址带过去。
            <a href={site.footerUrl} target="_blank" rel="noopener noreferrer">
              {site.footerText}
            </a>
          ) : (
            site.footerText
          )}
        </p>
      )}
    </footer>
  );
}
