import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { forbidden, invalid } from "../errors";

/**
 * 站点设置。存成"设置项 → 值"的形式，以后加新的设置项不需要改表结构。
 */
export type SiteSettings = {
  /** 网站名，显示在每个页面的左上角、浏览器标签和订阅源里 */
  name: string;
  /** 一句话介绍，给搜索引擎和订阅源用，不显示在页面上 */
  description: string;
  /** 作者署名，用在订阅源里 */
  author: string;
  /** 网站对外的地址，例如 https://example.com。订阅源和站点地图里的链接以它开头 */
  url: string;
};

/** 还没设置过时的默认值。 */
export const DEFAULT_SETTINGS: SiteSettings = { name: "我的博客", description: "", author: "", url: "" };

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof SiteSettings)[];

export function getSiteSettings(db: Db): SiteSettings {
  const stored = new Map(db.select().from(settings).all().map((row) => [row.key, row.value]));
  const result = { ...DEFAULT_SETTINGS };
  for (const key of KEYS) result[key] = stored.get(key) ?? DEFAULT_SETTINGS[key];
  return result;
}

/** 把网址整理成"协议加域名"的形式：去掉末尾的斜杠和路径。不合法时抛错。 */
function normalizeUrl(input: string): string {
  const text = input.trim();
  if (!text) return "";
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw invalid("网站地址不是一个合法的网址。请写完整，例如 https://example.com。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw invalid("网站地址需要以 http:// 或 https:// 开头。");
  return parsed.origin;
}

export function updateSiteSettings(db: Db, actor: Actor, input: Partial<SiteSettings>): SiteSettings {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改站点设置。");
  const next = { ...getSiteSettings(db) };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw invalid("网站名不能为空。");
    if ([...name].length > 40) throw invalid("网站名最多 40 个字。");
    next.name = name;
  }
  if (input.description !== undefined) {
    const description = input.description.trim();
    if ([...description].length > 200) throw invalid("介绍最多 200 个字。");
    next.description = description;
  }
  if (input.author !== undefined) next.author = input.author.trim().slice(0, 60);
  if (input.url !== undefined) next.url = normalizeUrl(input.url);

  db.transaction((tx) => {
    for (const key of KEYS) {
      tx.insert(settings).values({ key, value: next[key] }).onConflictDoUpdate({ target: settings.key, set: { value: next[key] } }).run();
    }
  });
  return next;
}
