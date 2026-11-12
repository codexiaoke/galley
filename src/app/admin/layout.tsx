import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Galley 后台" }, robots: { index: false } };

/**
 * 后台的最外层。只负责套上后台自己的配色（见 globals.css 里的 .admin）。
 * 左侧菜单在 (panel)/layout.tsx 里，登录页不带菜单。
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="admin flex-1">{children}</div>;
}
