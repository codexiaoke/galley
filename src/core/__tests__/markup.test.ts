import { describe, expect, it } from "vitest";
import { parseMarkup } from "../markup/parse";

describe("正文标记解析", () => {
  it("取出依据、取值、整块嵌入和组件里的引用", () => {
    const body = [
      ":cite[Codex 从 2026 年 3 月起支持插件]{b=k7f3q2x9}，一个插件可以打包技能。",
      "",
      "目前的最新版本是 :value{b=n5t2r8ye key=version}。",
      "",
      "::block{id=c9d2h5ta}",
      "",
      '::chart{data=d81k2mvv type=bar title="各系统支持 MCP 的时间"}',
      "",
      ":::callout{type=warning}",
      "提示框里也可以写 :cite[依据]{b=k7f3q2x9}。",
      ":::",
    ].join("\n");

    const { refs, issues } = parseMarkup(body);
    expect(issues).toEqual([]);
    expect(refs.map((r) => [r.mode, r.blockId, r.directive])).toEqual([
      ["cite", "k7f3q2x9", "cite"],
      ["value", "n5t2r8ye", "value"],
      ["embed", "c9d2h5ta", "block"],
      ["embed", "d81k2mvv", "chart"],
      ["cite", "k7f3q2x9", "cite"],
    ]);
    expect(refs[0].spanText).toBe("Codex 从 2026 年 3 月起支持插件");
    expect(refs[1].valueKey).toBe("version");
    expect(refs[3].param).toBe("data");
    expect(refs.map((r) => r.ordinal)).toEqual([0, 1, 2, 3, 4]);
  });

  it("一段依据可以依赖多个知识块", () => {
    const { refs } = parseMarkup(':cite[两件事合在一起]{b="k7f3q2x9 p4m8w1zc"}');
    expect(refs.map((r) => r.blockId)).toEqual(["k7f3q2x9", "p4m8w1zc"]);
    expect(refs.every((r) => r.spanText === "两件事合在一起")).toBe(true);
  });

  it("报告缺少参数、编号格式不对、写法不对和组件参数不合法", () => {
    const cases: [string, RegExp][] = [
      [":cite[没有编号]", /缺少知识块编号/],
      [":cite[]{b=k7f3q2x9}", /需要有文字/],
      [":cite[编号太短]{b=abc}", /不是合法的知识块编号/],
      [":value{b=k7f3q2x9}", /需要 b 和 key/],
      ["::block", /缺少 id/],
      [":block{id=k7f3q2x9}", /应该写成 ::block/],
      ["::chart{data=d81k2mvv type=radar}", /chart 的参数不合法/],
    ];
    for (const [body, pattern] of cases) {
      const { issues, refs } = parseMarkup(body);
      expect(issues.filter((i) => i.level === "error").map((i) => i.message).join("\n"), body).toMatch(pattern);
      expect(refs, body).toEqual([]);
    }
  });

  it("普通文字里的冒号不会被当成标记", () => {
    const { refs, issues } = parseMarkup("时间是 10:30，格式是 key:value，网址是 https://example.com/a:b。");
    expect(refs).toEqual([]);
    expect(issues).toEqual([]);
  });

  it("未登记但看起来有意写的标记给出提醒", () => {
    const { issues } = parseMarkup("::unknown{a=1}");
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
  });
});
