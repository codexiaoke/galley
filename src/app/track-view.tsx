"use client";

import { useEffect } from "react";

/**
 * 记一次访问：页面显示出来之后，向站点自己的接口报告"这个页面被看了一次"。
 * 不使用 Cookie，不加载任何第三方脚本。怎样计数、保存什么，见 core/services/analytics.ts。
 */
export function TrackView({ path }: { path: string }) {
  useEffect(() => {
    // keepalive：读者很快离开页面时，这个请求也能发完。失败了就算了，不影响阅读。
    fetch("/api/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, referrer: document.referrer }),
      keepalive: true,
    }).catch(() => {});
  }, [path]);
  return null;
}
