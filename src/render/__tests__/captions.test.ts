import { describe, expect, it } from "vitest";
import { CAPTION_LIMIT, captionParts, captionWidth, speakingTime } from "../captions";

describe("字幕分段", () => {
  it("短的一句就是一段", () => {
    expect(captionParts("先看页面自己。")).toEqual(["先看页面自己。"]);
    expect(captionParts("  ")).toEqual([]);
  });

  it("两三句的讲稿按句子断开，每段不超过一行", () => {
    const say = "可是别高兴太早。Worker 跟页面还是一家人，同一个源。它往外发请求，读者的登录状态照样跟着走。";
    const parts = captionParts(say);
    expect(parts).toEqual(["可是别高兴太早。Worker 跟页面还是一家人，同一个源。", "它往外发请求，读者的登录状态照样跟着走。"]);
    expect(parts.every((p) => captionWidth(p) <= CAPTION_LIMIT)).toBe(true);
    // 一个字都不丢
    expect(parts.join("")).toBe(say);
  });

  it("一句话太长时按逗号断，段尾的逗号不要", () => {
    const parts = captionParts("那换个地方跑呢？挪进 Worker 以后你看，它现在够不着页面了，就算写个死循环，卡住的也只是它自己，页面照样能点能滚动。");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => captionWidth(p) <= CAPTION_LIMIT)).toBe(true);
    expect(parts.every((p) => !/[，、,]$/.test(p))).toBe(true);
  });

  it("没有标点的长句按宽度切，不把英文单词切开", () => {
    const parts = captionParts("这是一段完全没有任何标点符号的很长很长的讲稿它一直往下写一直往下写直到超过一行能放下的宽度为止 postMessage structuredClone");
    expect(parts.every((p) => captionWidth(p) <= CAPTION_LIMIT)).toBe(true);
    expect(parts.join(" ")).toContain("postMessage");
    expect(parts.join(" ")).toContain("structuredClone");
  });

  it("引号跟着句号留在前一段，小数点不算句子结束", () => {
    expect(captionParts("他说：“先别急。”然后把版本从 1.5 升到了 2.0，再把剩下的一口气全部改完，一个也没有落下。")[0]).toBe("他说：“先别急。”");
    expect(captionParts("版本是 1.5。").join("")).toBe("版本是 1.5。");
  });

  it("说话的时间按字数估，最短一秒半", () => {
    expect(speakingTime("好。")).toBe(1500);
    expect(speakingTime("它往外发请求，读者的登录状态照样跟着走。")).toBeGreaterThan(4000);
  });
});
