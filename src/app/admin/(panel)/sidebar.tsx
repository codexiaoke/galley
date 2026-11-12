"use client";

import { Archive, Boxes, ChartColumn, MessageSquare, ExternalLink, FileText, FolderTree, Image as ImageIcon, Inbox, LayoutDashboard, ListTodo, LoaderCircle, LogOut, PlugZap, Settings, type LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { logout } from "../actions";

type Item = { href: string; label: string; icon: LucideIcon; match?: string[] };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "运营",
    items: [
      { href: "/admin", label: "看板", icon: LayoutDashboard, match: ["/admin/change-sets"] },
      { href: "/admin/materials", label: "素材箱", icon: Inbox },
      { href: "/admin/topics", label: "选题池", icon: ListTodo },
      { href: "/admin/messages", label: "留言", icon: MessageSquare },
      { href: "/admin/analytics", label: "运营分析", icon: ChartColumn },
    ],
  },
  {
    title: "内容",
    items: [
      { href: "/admin/documents", label: "文章", icon: FileText },
      { href: "/admin/blocks", label: "知识块", icon: Boxes },
      { href: "/admin/categories", label: "分类", icon: FolderTree },
      { href: "/admin/media", label: "媒体库", icon: ImageIcon },
    ],
  },
  {
    title: "站点",
    items: [
      { href: "/admin/agents", label: "MCP 管理", icon: PlugZap },
      { href: "/admin/settings", label: "站点设置", icon: Settings },
      { href: "/admin/backup", label: "备份与导出", icon: Archive },
    ],
  },
];

const ITEMS = GROUPS.flatMap((group) => group.items);

const ITEM = "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150";

const SLIDE = "260ms cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * 菜单项的图标，以及"新页面还没出来"时的小圈。
 *
 * 宽屏下菜单是竖排的，每一项占满整行，小圈放在这一项的最右边。
 * 窄屏下菜单是横排的，每一项的宽度由内容决定：如果小圈也放在右边，这一项会突然变宽，
 * 把后面的项挤开，底色块也会跟着量错宽度。所以窄屏下小圈直接顶替图标的位置，不占额外的地方。
 */
function ItemContent({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <Icon size={17} strokeWidth={active ? 2.2 : 1.8} className={pending ? "max-lg:hidden" : undefined} />
      {pending && <LoaderCircle size={17} className="animate-spin lg:hidden" />}
      {label}
      {pending && <LoaderCircle size={14} className="ml-auto animate-spin text-a-muted max-lg:hidden" />}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const pathActive = ITEMS.find((item) =>
    item.href === "/admin"
      ? pathname === "/admin" || (item.match ?? []).some((p) => pathname.startsWith(p))
      : pathname.startsWith(item.href),
  )?.href;

  // 点击之后立刻把选中状态移过去，不等新页面加载完。
  // 记录点击时所在的页面：一旦页面变了（不管是到了目标页还是去了别处），这条记录就作废。
  const [clicked, setClicked] = useState<{ href: string; from: string } | null>(null);
  const activeHref = clicked && clicked.from === pathname ? clicked.href : pathActive;

  /**
   * 选中项的底色块。
   *
   * 它是菜单里单独的一个元素，垫在所有文字的下面，位置由脚本量出来再移动过去。
   * 这样它滑动时只是从文字底下经过，不会像之前那样盖住沿途的文字。
   */
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const placed = useRef(false);

  const activeRef = useRef(activeHref);

  /** 把底色块移到当前选中的那一项上。animate 为假时直接到位，不滑动。 */
  const place = useCallback((animate: boolean) => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const link = activeRef.current ? linkRefs.current.get(activeRef.current) : undefined;
    if (!link) {
      pill.style.opacity = "0";
      return;
    }
    // 横排放不下时菜单可以左右滑动。选中的那一项如果有一部分在外面，先把它滑进来。
    if (nav.scrollWidth > nav.clientWidth) {
      // 菜单是定位元素，所以 offsetLeft 就是这一项相对菜单内容左边的距离。
      const start = link.offsetLeft;
      const margin = 12;
      if (start - margin < nav.scrollLeft) nav.scrollLeft = start - margin;
      else if (start + link.offsetWidth + margin > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = start + link.offsetWidth + margin - nav.clientWidth;
    }
    const navBox = nav.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    pill.style.transition = animate ? `transform ${SLIDE}, width ${SLIDE}, height ${SLIDE}, opacity 150ms` : "none";
    pill.style.transform = `translate(${box.left - navBox.left + nav.scrollLeft}px, ${box.top - navBox.top + nav.scrollTop}px)`;
    pill.style.width = `${box.width}px`;
    pill.style.height = `${box.height}px`;
    pill.style.opacity = "1";
  }, []);

  // 选中项变化时滑过去。第一次直接放到位，避免刚打开页面时从角落滑进来。
  useLayoutEffect(() => {
    activeRef.current = activeHref;
    place(placed.current);
    placed.current = true;
  }, [activeHref, place]);

  // 尺寸变化时重新量一次，底色块始终和选中的那一项一样大：
  // - 菜单本身变了（窗口宽度变化，竖排和横排之间切换）：直接到位，不滑动。
  // - 某一项变了（横排时选中项的字变粗、字体加载完成等）：平滑地跟过去，不打断正在进行的滑动。
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    // 开始监听时浏览器会先通知一次，那一次不是真的尺寸变化，要跳过，否则会打断正在进行的滑动。
    let first = true;
    const observer = new ResizeObserver((entries) => {
      if (first) {
        first = false;
        return;
      }
      place(!entries.some((entry) => entry.target === nav));
    });
    observer.observe(nav);
    for (const link of linkRefs.current.values()) observer.observe(link);
    return () => observer.disconnect();
  }, [place]);

  return (
    <aside className="border-b border-a-border bg-a-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="admin-logo grid size-7 place-items-center rounded-md text-sm font-bold text-white">G</span>
        <span className="font-semibold">Galley</span>
        <span className="text-xs text-a-muted">后台</span>
      </div>

      <nav ref={navRef} className="relative flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0">
        <span
          ref={pillRef}
          aria-hidden="true"
          className="pointer-events-none rounded-md bg-a-primary-soft"
          style={{ position: "absolute", left: 0, top: 0, opacity: 0 }}
        />
        {GROUPS.map((group) => (
          // shrink-0：横排放不下时整条菜单左右滑动，而不是把每一组压窄、让里面的项叠在一起
          <div key={group.title} className="flex shrink-0 gap-1 lg:block lg:space-y-0.5">
            <p className="hidden px-3 pb-1.5 text-xs font-medium text-a-muted lg:block">{group.title}</p>
            {group.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ref={(node) => {
                    if (node) linkRefs.current.set(item.href, node);
                    else linkRefs.current.delete(item.href);
                  }}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setClicked({ href: item.href, from: pathname })}
                  className={`${ITEM} shrink-0 ${active ? "font-medium text-a-primary" : "text-a-text hover:bg-a-subtle"}`}
                >
                  <ItemContent icon={item.icon} label={item.label} active={active} />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="hidden space-y-0.5 border-t border-a-border p-3 lg:block">
        <Link href="/" target="_blank" className={`${ITEM} text-a-muted hover:bg-a-subtle hover:text-a-text`}>
          <ExternalLink size={17} strokeWidth={1.8} />
          查看前台
        </Link>
        <form action={logout}>
          <button className={`${ITEM} w-full text-a-muted hover:bg-a-subtle hover:text-a-text`}>
            <LogOut size={17} strokeWidth={1.8} />
            退出登录
          </button>
        </form>
      </div>
    </aside>
  );
}
