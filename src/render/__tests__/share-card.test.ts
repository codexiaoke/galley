import { describe, expect, it } from "vitest";
import { cardSvg, wrapText } from "../share-card";

describe("分享卡片", () => {
  it("按宽度折行，英文单词不从中间断开，放不下时加省略号", () => {
    expect(wrapText("一二三四五六七八九十", 5 * 10, 10, 3)).toEqual(["一二三四五", "六七八九十"]);
    const lines = wrapText("用 SQLite 做博客的数据库", 8 * 20, 20, 3);
    expect(lines.join("")).toContain("SQLite");
    expect(lines.every((l) => !l.startsWith("QLite"))).toBe(true);
    const cut = wrapText("一二三四五六七八九十一二三四五", 5 * 10, 10, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1].endsWith("…")).toBe(true);
  });

  it("文字里的尖括号和引号会被转义", () => {
    const svg = cardSvg({ site: "站", title: '<script>"x"</script>' });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&quot;x&quot;");
  });
});
