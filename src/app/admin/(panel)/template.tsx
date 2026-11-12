import type { ReactNode } from "react";

/**
 * 每次切换页面都会重新挂载的一层。用它让新页面的内容轻微上浮淡入，
 * 切换菜单时不会感觉是硬生生地换了一屏。
 */
export default function PanelTemplate({ children }: { children: ReactNode }) {
  return <div className="admin-enter">{children}</div>;
}
