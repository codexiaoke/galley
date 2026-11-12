import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/core/db/client";
import { findCategoryBySlug } from "@/core/services/categories";
import { listPublished, publishedSlugExists } from "@/core/services/documents";
import { getSiteSettings } from "@/core/services/settings";

/**
 * 文章或分类不存在时，返回真正的 404 状态码。
 *
 * 页面是边渲染边发送的：外壳先发出去，这时状态码已经是 200，
 * 等发现文章不存在再想改成 404 已经来不及了，搜索引擎和监控工具会把它当成"软 404"。
 * 所以在渲染之前先查一下：不存在就转到一个没有任何页面的地址，由框架返回 404 页面和 404 状态码。
 * 地址栏里的网址不变。
 */
export function proxy(request: NextRequest) {
  const [, section, rawSlug, ...rest] = request.nextUrl.pathname.split("/");
  // "关于"页是站长自己建的，没建的时候它不存在。
  if (section === "about" && !rawSlug) return publishedSlugExists(getDb(), "about", "page") ? NextResponse.next() : missing(request);
  // 运营日志可以在站点设置里关掉。
  if (section === "log" && !rawSlug) return getSiteSettings(getDb()).showLog === "on" ? NextResponse.next() : missing(request);
  if (!rawSlug || rest.length > 0) return NextResponse.next();
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return missing(request);
  }
  const db = getDb();
  const exists =
    section === "posts"
      ? publishedSlugExists(db, slug)
      : section === "category"
        ? !!findCategoryBySlug(db, slug)
        : section === "tag"
          ? listPublished(db, "article", { tag: slug }).length > 0
          : true;
  return exists ? NextResponse.next() : missing(request);
}

/** 以下划线开头的目录不会成为页面，所以这个地址一定匹配不到任何路由。 */
const missing = (request: NextRequest) => NextResponse.rewrite(new URL("/_missing", request.url));

export const config = { matcher: ["/posts/:slug", "/category/:slug", "/tag/:slug", "/about", "/log"] };
