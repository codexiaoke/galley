import { describe, expect, it } from "vitest";
import { checkMermaid } from "../markup/mermaid";
import { parseMarkup } from "../markup/parse";

describe("Mermaid 图保存前检查", () => {
  it("写对的图通过；写错的图在保存时就报错，带着出错的行", async () => {
    const good = "```mermaid\nclassDiagram\n  class Customer[\"客户\"]\n  Customer --> Order : 下单\n```";
    const goodState = "```mermaid\nstateDiagram-v2\n  [*] --> 草稿\n  草稿 --> 待审: 提交\n```";
    const bad = "```mermaid\nsequenceDiagram\n  A->>B 少了冒号\n```";
    await checkMermaid([good, goodState, bad].join("\n\n"));
    expect(parseMarkup(good).issues).toEqual([]);
    expect(parseMarkup(goodState).issues).toEqual([]);
    const issue = parseMarkup(bad).issues[0];
    expect(issue.message).toMatch(/Mermaid 图的第 \d+ 行附近写错了/);
    expect(issue.line).toBe(1);
  }, 20000);
});
