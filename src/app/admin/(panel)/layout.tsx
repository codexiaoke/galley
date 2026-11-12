import { Suspense, type ReactNode } from "react";
import { ToastProvider } from "../toast";
import { Sidebar } from "./sidebar";

/** 登录后的后台页面：左侧菜单，右侧内容。 */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/*
          菜单要读取当前网址来标出选中的那一项。带参数的页面在构建时还不知道网址，
          所以菜单放在 Suspense 里；占位用同样的外框，避免页面跳动。
        */}
        <Suspense fallback={<aside className="border-b border-a-border bg-a-sidebar lg:h-screen lg:border-b-0 lg:border-r" />}>
          <Sidebar />
        </Suspense>
        <main className="min-w-0 px-5 py-8 lg:px-14 lg:py-12">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
