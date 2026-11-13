import { Resvg } from "@resvg/resvg-js";

/**
 * 分享卡片：文章被转发到微信、推特等地方时显示的那张图（1200×630）。
 *
 * 先拼一张 SVG，再用 resvg 转成 PNG。字体用服务器上装好的中文字体（Docker 镜像里装了思源宋体和思源黑体，
 * 见 Dockerfile；在 Mac 上开发时用系统自带的宋体、苹方），不去网上下载：国内的服务器多半连不上谷歌字体。
 *
 * 版式跟着前台走：纸张色的底，左上角朱红色的站名，中间是宋体的大标题，下面一行摘要，底部是日期和网址。
 */

export const CARD = { width: 1200, height: 630 };

const COLORS = { paper: "#f6f1e6", ink: "#29241e", soft: "#5a5247", faint: "#81786a", accent: "#a63d2a", rule: "#dcd3c0" };
// 字体名不加引号：resvg 遇到一串带引号的名字时会认错，全部退回到默认字体。
const SERIF = "Noto Serif CJK SC, Source Han Serif SC, Songti SC, STSong, serif";
const SANS = "Noto Sans CJK SC, Source Han Sans SC, PingFang SC, Hiragino Sans GB, sans-serif";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 估算一个字有多宽（以字号为单位）：汉字和全角标点是 1，英文字母和数字大约一半。 */
function charWidth(ch: string): number {
  if (/\s/.test(ch)) return 0.3;
  if (/[⺀-￯]/.test(ch)) return 1;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[il.,:;'!|]/.test(ch)) return 0.3;
  return 0.56;
}

/**
 * 按宽度折行，最多 maxLines 行，放不下时最后一行末尾加省略号。
 * 英文单词不从中间断开（单词本身比一行还长时才断）。
 */
export function wrapText(text: string, width: number, fontSize: number, maxLines: number): string[] {
  const tokens = text.replace(/\s+/g, " ").trim().match(/[A-Za-z0-9][A-Za-z0-9.'’_-]*|\s|./gu) ?? [];
  const lines: string[] = [];
  let line = "";
  let used = 0;
  const widthOf = (s: string) => [...s].reduce((sum, ch) => sum + charWidth(ch), 0) * fontSize;
  for (const token of tokens) {
    const w = widthOf(token);
    if (used + w > width && line.trim()) {
      lines.push(line.trimEnd());
      line = token === " " ? "" : token;
      used = token === " " ? 0 : w;
    } else {
      line += token;
      used += w;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && widthOf(`${last}…`) > width) last = [...last].slice(0, -1).join("");
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export type CardContent = {
  /** 左上角的小字：站名 */
  site: string;
  title: string;
  summary?: string;
  /** 底部左边：日期或者别的一句话 */
  footer?: string;
  /** 底部右边：网址 */
  url?: string;
  /** 标题上方的小标签，比如系列名 */
  kicker?: string;
};

export function cardSvg(content: CardContent): string {
  const left = 96;
  const width = CARD.width - left * 2;
  // 标题短时字大一些，长时缩小一档，最多三行
  let size = 68;
  let lines = wrapText(content.title, width, size, 2);
  if (lines.at(-1)?.endsWith("…")) {
    size = 56;
    lines = wrapText(content.title, width, size, 3);
  }
  const lineHeight = size * 1.32;
  const summary = content.summary ? wrapText(content.summary, width, 28, lines.length >= 3 ? 1 : 2) : [];
  // 标题和摘要作为一整块，放在站名和底部横线之间、略偏上的位置
  const blockHeight = (content.kicker ? 44 : 0) + lines.length * lineHeight + (summary.length ? 50 + summary.length * 44 : 0);
  const top = Math.max(150, 150 + (CARD.height - 112 - 40 - 150 - blockHeight) * 0.4);
  const kickerY = top + 24;
  const titleTop = top + (content.kicker ? 44 : 0) + size;
  // 摘要和标题之间空出一行左右：标题最后一行的基线往下，先让过字的下沿，再空一段
  const summaryTop = titleTop + (lines.length - 1) * lineHeight + size * 0.3 + 62;
  const parts: string[] = [
    `<rect width="${CARD.width}" height="${CARD.height}" fill="${COLORS.paper}"/>`,
    // 左边一条朱红竖线，和前台的引文、系列目录一个样子
    `<rect x="56" y="64" width="6" height="${CARD.height - 128}" fill="${COLORS.accent}"/>`,
    `<text x="${left}" y="104" font-family="${SANS}" font-size="28" font-weight="600" fill="${COLORS.accent}" letter-spacing="2">${escape(content.site)}</text>`,
  ];
  if (content.kicker) {
    parts.push(`<text x="${left}" y="${kickerY}" font-family="${SANS}" font-size="24" fill="${COLORS.faint}" letter-spacing="1">${escape(content.kicker)}</text>`);
  }
  lines.forEach((line, i) => {
    parts.push(`<text x="${left}" y="${titleTop + i * lineHeight}" font-family="${SERIF}" font-size="${size}" font-weight="700" fill="${COLORS.ink}">${escape(line)}</text>`);
  });
  summary.forEach((line, i) => {
    parts.push(`<text x="${left}" y="${summaryTop + i * 44}" font-family="${SERIF}" font-size="28" fill="${COLORS.soft}">${escape(line)}</text>`);
  });
  parts.push(`<rect x="${left}" y="${CARD.height - 112}" width="${width}" height="1.5" fill="${COLORS.rule}"/>`);
  if (content.footer) {
    parts.push(`<text x="${left}" y="${CARD.height - 66}" font-family="${SANS}" font-size="24" fill="${COLORS.faint}">${escape(content.footer)}</text>`);
  }
  if (content.url) {
    parts.push(`<text x="${CARD.width - left}" y="${CARD.height - 66}" text-anchor="end" font-family="${SANS}" font-size="24" fill="${COLORS.faint}">${escape(content.url)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}">${parts.join("")}</svg>`;
}

/** 把卡片画成 PNG。 */
export function renderCard(content: CardContent): Buffer {
  const resvg = new Resvg(cardSvg(content), {
    fitTo: { mode: "width", value: CARD.width },
    // 用系统里装好的字体；找不到某个字时 resvg 会按上面列的顺序往后找
    font: { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}

/** 给 opengraph-image 用：PNG 加上缓存头。内容变了网址不变，所以缓存一小时，不要太久。 */
export function cardResponse(content: CardContent): Response {
  return new Response(new Uint8Array(renderCard(content)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
