import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { OWNER } from "../src/core/actor";
import type { Db } from "../src/core/db/client";
import { listMedia, saveMedia } from "../src/core/services/media";

/** 实验例稿的空间标牌也是普通图片资源，不增加播放器文字或案例接口。 */
export function bindLabLabels(db: Db, source: string) {
  if (!source.includes("__LLM_")) return source;
  const labels = JSON.parse(readFileSync("examples/scenes/training-labels.json", "utf8")) as Record<string, [string, string]>;
  const existing = listMedia(db);
  let body = source;
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  for (const [key, [title, subtitle]] of Object.entries(labels)) {
    const token = `__LLM_${key}__`;
    if (!body.includes(token)) continue;
    const compact = key.startsWith("TOKEN_") || key.startsWith("WORD_") || key === "TARGET";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360"><rect width="1200" height="360" rx="22" fill="#0a1728"/><path d="M48 50H180" stroke="#54d5ed" stroke-width="7"/><text x="${compact ? 600 : 48}" y="${compact ? 240 : 180}" text-anchor="${compact ? "middle" : "start"}" font-family="Arial, PingFang SC, sans-serif" font-size="${compact ? 210 : 86}" font-weight="600" fill="#e0f5ff">${escape(title)}</text><text x="52" y="${compact ? 328 : 284}" font-family="Arial, PingFang SC, sans-serif" font-size="34" letter-spacing="3" fill="#76a8bf">${escape(subtitle)}</text></svg>`;
    const bytes = new Resvg(svg).render().asPng();
    const originalName = `${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}-training-${key}.png`;
    const media = existing.find((item) => item.originalName === originalName) ?? saveMedia(db, OWNER, { bytes, originalName, alt: `${title} · ${subtitle}`, family: "image" });
    body = body.replaceAll(token, `/media/${media.name}`);
  }
  return body;
}
