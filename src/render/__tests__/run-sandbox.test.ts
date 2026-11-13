import { describe, expect, it } from "vitest";
import { runJavaScript } from "../client/run-sandbox";

describe("浏览器里运行的代码", () => {
  it("打印的值按控制台的样子显示", async () => {
    const out = await runJavaScript('console.log("a", 1, [1, "x"], { k: true }, new Map([[1, 2]]));');
    expect(out.error).toBeUndefined();
    expect(out.lines).toEqual([{ level: "log", text: 'a 1 [ 1, "x" ] { k: true } Map(1) { 1 => 2 }' }]);
  });

  it("没有打印时显示最后一个表达式的值", async () => {
    const out = await runJavaScript("const xs = [3, 1, 2];\nxs.sort()");
    expect(out.lines).toEqual([{ level: "result", text: "[ 1, 2, 3 ]" }]);
  });

  it("定时器和 Promise 按顺序执行", async () => {
    const out = await runJavaScript(`setTimeout(() => console.log("late"), 100);\nsetTimeout(() => console.log("early"), 10);\nPromise.resolve().then(() => console.log("micro"));\nconsole.log("sync");`);
    expect(out.lines.map((l) => l.text)).toEqual(["sync", "micro", "early", "late"]);
  });

  it("出错时告诉是第几行；死循环会被打断；碰不到网络", async () => {
    expect((await runJavaScript("const a = 1;\nnull.x")).error).toMatch(/第 2 行/);
    expect((await runJavaScript("while (true) {}")).error).toMatch(/死循环/);
    expect((await runJavaScript("typeof fetch + typeof XMLHttpRequest + typeof document")).lines[0].text).toBe("undefinedundefinedundefined");
  }, 10000);

  it("输出太多时截断", async () => {
    const out = await runJavaScript("for (let i = 0; i < 1000; i++) console.log(i)");
    expect(out.truncated).toBe(true);
    expect(out.lines.length).toBeLessThanOrEqual(200);
  });
});
