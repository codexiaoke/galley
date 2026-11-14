import { describe, expect, it } from "vitest";
import { advance, leadsOn, planBuild, type BuildStop, type BuildUnit } from "../build";

const units = (texts: string[]): BuildUnit[] => planBuild(texts.map(leadsOn)).map((plan, i) => ({ type: "unit", ...plan, chars: texts[i].length, apply: () => {} }));
/** 一个有 n 步的播放器 */
const player = (n: number) => {
  let index = 0;
  const stop: BuildStop = {
    type: "player",
    step: (dir) => {
      const next = index + dir;
      if (next < 0 || next > n) return null;
      index = next;
      return { caption: `第 ${index} 步` };
    },
  };
  return { stop, at: () => index };
};
const states = (stops: BuildStop[]) => stops.map((s) => (s.type === "unit" ? s.state : "player")).join(" ");

describe("页内一条一条出现", () => {
  it("只有一条文字时不分步", () => {
    expect(planBuild([false])).toEqual([]);
    expect(planBuild([])).toEqual([]);
  });

  it("第一条一进来就在，其余的按一下出一条，出完才翻页", () => {
    const stops: BuildStop[] = units(["第一段。", "第二段。", "第三段。"]);
    expect(states(stops)).toBe("first pending pending");
    expect(advance(stops, 1)).toEqual({ chars: 4 });
    expect(states(stops)).toBe("first shown pending");
    advance(stops, 1);
    expect(states(stops)).toBe("first shown shown");
    expect(advance(stops, 1)).toBeNull();
  });

  it("往回走是原路退回，退到只剩第一条时才翻回上一页", () => {
    const stops: BuildStop[] = units(["甲", "乙", "丙"]);
    advance(stops, 1);
    advance(stops, 1);
    advance(stops, -1);
    expect(states(stops)).toBe("first shown pending");
    advance(stops, -1);
    expect(states(stops)).toBe("first pending pending");
    expect(advance(stops, -1)).toBeNull();
  });

  it("以冒号结尾的是引子，和它引出的下一条一起出现、一起收回", () => {
    const opening: BuildStop[] = units(["原因有三个：", "第一，慢。", "第二，贵。"]);
    // 第一条本身是引子：下一条也一进来就在
    expect(states(opening)).toBe("first first pending");

    const middle: BuildStop[] = units(["先说结论。", "原因有两个：", "第一，慢。", "第二，贵。"]);
    expect(advance(middle, 1)).toEqual({ chars: 6 + 5 });
    expect(states(middle)).toBe("first shown shown pending");
    advance(middle, -1);
    expect(states(middle)).toBe("first pending pending pending");
  });

  it("文字和播放器按页面上的先后穿插：前面的文字先出，播放器走完，后面的文字再出", () => {
    const [a, b, c] = units(["引入。", "看代码之前先说一句。", "总结。"]);
    const p = player(2);
    const stops: BuildStop[] = [a, b, p.stop, c];
    expect(advance(stops, 1)).toEqual({ chars: 10 }); // 播放器前面的那条文字
    expect(advance(stops, 1)).toEqual({ player: { caption: "第 1 步" } });
    expect(advance(stops, 1)).toEqual({ player: { caption: "第 2 步" } });
    expect(advance(stops, 1)).toEqual({ chars: 3 }); // 播放器走完了，轮到后面的文字
    expect(advance(stops, 1)).toBeNull();
    // 原路退回
    advance(stops, -1);
    expect(states(stops)).toBe("first shown player pending");
    expect(p.at()).toBe(2);
    advance(stops, -1);
    advance(stops, -1);
    expect(p.at()).toBe(0);
    advance(stops, -1);
    expect(states(stops)).toBe("first pending player pending");
    expect(advance(stops, -1)).toBeNull();
  });
});
