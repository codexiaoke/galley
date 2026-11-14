import Link from "next/link";

/** 列表上方的筛选页签：一排文字，选中的那个有浅底色。每一项是一个链接，筛选条件写在网址里。 */
export function FilterTabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-0.5 border-b border-a-border py-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors duration-100 ${
            tab.key === active ? "bg-a-subtle font-medium text-a-text" : "text-a-muted hover:bg-a-subtle/70 hover:text-a-text"
          }`}
        >
          {tab.label}
          {tab.count !== undefined && <span className="text-xs tabular-nums text-a-muted">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
