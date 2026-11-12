import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { getDb } from "@/core/db/client";
import { getSiteSettings } from "@/core/services/settings";
import { PUBLIC_CONTENT_TAG } from "./data";

/**
 * 站点的基本信息：网站名、介绍、作者、对外的地址。站长在后台的"站点设置"里修改。
 *
 * 注意：Galley 是这套程序的名字，不是站点的名字，不应该出现在读者看到的页面上。
 */

async function cachedSite() {
  "use cache";
  cacheLife("max");
  cacheTag(PUBLIC_CONTENT_TAG);
  return getSiteSettings(getDb());
}

/** 先等待真实的请求，再读带缓存的设置。原因见 data.ts 开头的说明。 */
export async function loadSite() {
  await connection();
  return cachedSite();
}
