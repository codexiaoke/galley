import { describe, expect, it } from "vitest";
import { getComponent } from "../markup/components";
import { parseMarkup } from "../markup/parse";
import { isBlend, sceneFrame } from "../scene/frame";
import { runScene, runScenes } from "../scene/run";
import { narrationIsLiteral, stripNarration, withoutNarration } from "../scene/shared";

const ok = async (code: string, ratio?: "16:9" | "4:3") => {
  const r = await runScene(code, ratio);
  if (!r.ok) throw new Error(r.error);
  return r.scene;
};

const BASIC = `const a = box("页面", { tone: "c2" })
const b = box("Worker")
row([a, b], { gap: 200 })
const link = arrow(a, b, { label: "postMessage" })
show(a)
step("把任务交给 Worker。", () => {
  show(b, { from: "right" })
  show(link)
  send(link, { label: "任务" })
})
step("页面挪到左边。", () => {
  together(() => {
    move(a, { dx: -40 })
    highlight(b)
  })
})`;

const node = (scene: Awaited<ReturnType<typeof ok>>, text: string) => scene.nodes.find((n) => n.props.text === text)!;

describe("场景动画", () => {
  it("第一步之前的动作直接改一开始的样子，不算动画", async () => {
    const scene = await ok(BASIC);
    expect(scene.w).toBe(800);
    expect(scene.h).toBe(450);
    expect(node(scene, "页面").props.opacity).toBe(1);
    expect(node(scene, "Worker").props.opacity).toBe(0);
    // row 把两个方块作为一个整体居中：左边空出来的和右边空出来的一样多
    const page = node(scene, "页面").props as Record<string, number>;
    const worker = node(scene, "Worker").props as Record<string, number>;
    expect(page.x - page.w / 2).toBeCloseTo(800 - (worker.x + worker.w / 2));
    expect(worker.x - worker.w / 2 - (page.x + page.w / 2)).toBeCloseTo(200);
    expect(node(scene, "页面").props.stroke).toBe("c2");
    expect(node(scene, "页面").props.fill).toBe("c2/14");
  });

  it("一步里的动作默认一个接一个，together 里的同时开始", async () => {
    const scene = await ok(BASIC);
    const [first, second] = scene.steps;
    expect(first.text).toBe("把任务交给 Worker。");
    const worker = node(scene, "Worker").id;
    const link = scene.nodes.find((n) => n.kind === "link")!.id;
    const packet = scene.nodes.find((n) => n.kind === "packet")!;
    expect(packet.along).toBe(link);
    const startOf = (id: string) => Math.min(...first.tweens.filter((t) => t.id === id).map((t) => t.at));
    expect(startOf(worker)).toBe(0);
    expect(startOf(link)).toBeGreaterThan(0);
    expect(startOf(packet.id)).toBeGreaterThan(startOf(link));
    expect(first.duration).toBeGreaterThanOrEqual(Math.max(...first.tweens.map((t) => t.at + t.dur)));
    // together：挪动和标出同时开始
    expect(new Set(second.tweens.filter((t) => t.prop === "x" || t.prop === "stroke").map((t) => t.at))).toEqual(new Set([0]));
  });

  it("任意时刻的画面都能直接算出来，正着放和直接跳结果一样", async () => {
    const scene = await ok(BASIC);
    const worker = node(scene, "Worker").id;
    expect(sceneFrame(scene, -1, 0)[worker].opacity).toBe(0);
    const mid = sceneFrame(scene, 0, 200)[worker];
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThan(1);
    expect(mid.ox).toBeGreaterThan(0); // 从右边进来，还没到位
    expect(sceneFrame(scene, 0, Infinity)[worker]).toMatchObject({ opacity: 1, ox: 0 });
    // 第二步开始时就是第一步结束的样子
    expect(sceneFrame(scene, 1, 0)[worker].opacity).toBe(1);
    // 颜色的过渡：中间是两种颜色按进度混合
    const stroke = sceneFrame(scene, 1, 100)[worker].stroke;
    expect(isBlend(stroke) && stroke.a === "ink" && stroke.b === "accent").toBe(true);
    expect(sceneFrame(scene, 1, Infinity)[worker].stroke).toBe("accent");
    // 超出范围的步数：最后的样子
    expect(sceneFrame(scene, 99, 0)[worker].stroke).toBe("accent");
  });

  it("相对位置、边界框和镜头", async () => {
    const scene = await ok(`const a = box("甲", { x: 200, y: 200, w: 100, h: 50 })
const b = box("乙", { rightOf: a, gap: 60, w: 100, h: 50 })
const c = box("丙", { below: a, w: 100, h: 50 })
const f = frame("沙箱", { around: [a, b], pad: 20 })
step("看甲。", () => { show(a, b, c, f); zoomTo(a) })
step("回到全景。", () => { zoomOut() })`);
    expect(node(scene, "乙").props).toMatchObject({ x: 360, y: 200 });
    expect(node(scene, "丙").props).toMatchObject({ x: 200, y: 200 + 25 + 36 + 25 });
    const f = node(scene, "沙箱").props;
    expect(f.w).toBe(100 + 60 + 100 + 40);
    const camera = scene.nodes.find((n) => n.kind === "camera")!;
    expect(sceneFrame(scene, 0, Infinity)[camera.id]).toMatchObject({ x: 200, y: 200 });
    expect(sceneFrame(scene, 0, Infinity)[camera.id].zoom).toBeGreaterThan(1);
    // zoomOut 回到的全景，就是一开始的镜头
    expect(sceneFrame(scene, 1, Infinity)[camera.id]).toEqual(camera.props);
  });

  it("全景自动对准所有东西：摆得偏、摆得小、摆出舞台外面，都正好装下", async () => {
    const view = async (code: string) => {
      const scene = await ok(code);
      const { x, y, zoom } = scene.nodes.find((n) => n.kind === "camera")!.props as Record<string, number>;
      // 镜头里看得到的范围
      return { zoom, left: x - 400 / zoom, right: x + 400 / zoom, top: y - 225 / zoom, bottom: y + 225 / zoom };
    };
    // 只用到左上角一小块：镜头对过去并放大
    const corner = await view(`const a = box("甲", { x: 120, y: 80, w: 100, h: 50 })
const b = box("乙", { x: 420, y: 80, w: 100, h: 50 })
const c = box("丙", { x: 120, y: 240, w: 100, h: 50 })
step("出现。", () => show(a, b, c))`);
    expect(corner.zoom).toBeGreaterThan(1.3);
    expect(corner.left).toBeLessThan(70);
    expect(corner.right).toBeGreaterThan(470);
    expect(corner.top).toBeLessThan(55);
    expect(corner.bottom).toBeGreaterThan(265);

    // 后面的步骤里挪到了舞台外面：镜头退后，把挪过去的位置也装进来
    const moved = await view(`const a = box("甲", { x: 100, y: 225, w: 100, h: 50 })
step("出现。", () => show(a))
step("挪走。", () => move(a, { x: 1000 }))`);
    expect(moved.zoom).toBeLessThan(1);
    expect(moved.left).toBeLessThan(50);
    expect(moved.right).toBeGreaterThan(1050);

    // 只有两个小东西：最多放大到 1.8 倍
    const tiny = await view(`const a = box("甲", { w: 60, h: 40 })\nstep("出现。", () => show(a))`);
    expect(tiny.zoom).toBe(1.8);

    // 从没出现过的东西不算
    const hidden = await view(`const a = box("甲", { x: 400, y: 225, w: 700, h: 380 })
const never = box("没出现", { x: 3000, y: 3000 })
step("出现。", () => show(a))`);
    expect(hidden.zoom).toBe(1);

    // 第一步之前自己摆过镜头：按作者的来
    const own = await view(`const a = box("甲", { x: 120, y: 80 })
camera({ x: 300, y: 200, zoom: 1.2 })
step("出现。", () => show(a))`);
    expect(own).toMatchObject({ zoom: 1.2 });
  });

  it("focus 只留下给出的几个，不给参数时全部恢复", async () => {
    const scene = await ok(`const a = box("甲"), b = box("乙"), c = box("丙")
row([a, b, c])
show(a, b)
step("只看甲。", () => { focus(a) })
step("都回来。", () => { focus() })`);
    const at = (step: number, text: string) => sceneFrame(scene, step, Infinity)[node(scene, text).id].opacity;
    expect([at(0, "甲"), at(0, "乙"), at(0, "丙")]).toEqual([1, 0.22, 0]); // 丙还没出现，不动它
    expect([at(1, "甲"), at(1, "乙"), at(1, "丙")]).toEqual([1, 1, 0]);
  });

  it("写错的地方带着行号报出来", async () => {
    const wrongOption = await runScene(`const a = box("甲")\nconst b = box("乙", { width: 100 })\nstep("一", () => show(a))`);
    expect(wrongOption).toMatchObject({ ok: false, line: 2 });
    expect(!wrongOption.ok && wrongOption.error).toMatch(/第 2 行：box\(\) 不认识「width」/);

    const color = await runScene(`const a = box("甲", { fill: "#ff0000" })\nstep("一", () => show(a))`);
    expect(!color.ok && color.error).toMatch(/颜色只能用这些名字/);

    const noStep = await runScene(`const a = box("甲")\nshow(a)`);
    expect(!noStep.ok && noStep.error).toMatch(/至少要有一步/);

    const outside = await runScene(`const a = box("甲")\nstep("一", () => show(a))\nmove(a, { dx: 10 })`);
    expect(!outside.ok && outside.error).toMatch(/第 3 行.*都要写在 step/);

    const loop = await runScene(`while (true) {}`);
    expect(!loop.ok && loop.error).toMatch(/可能有死循环/);

    const tampered = await runScene(`const a = box("甲")\nstep("一", () => show(a))\n__nodes.push({ id: "x", kind: "bomb", props: {} })`);
    expect(!tampered.ok && tampered.error).toMatch(/数据不完整/);
  });

  it("保存正文时检查场景代码", async () => {
    const good = ":::scene{title=\"通信\"}\n```js\n" + BASIC + "\n```\n:::";
    await runScenes(good);
    expect(parseMarkup(good).issues).toEqual([]);

    const bad = ":::scene\n```js\nconst a = box(\"甲\")\nshow(b)\n```\n:::";
    await runScenes(bad);
    expect(parseMarkup(bad).issues.map((i) => i.message).join()).toMatch(/场景代码出错，第 2 行/);

    expect(parseMarkup(":::scene\n没有代码\n:::").issues.map((i) => i.message).join()).toMatch(/要放且只放一个/);
    expect(parseMarkup(":::scene{ratio=\"3:2\"}\n```js\nstep(\"一\")\n```\n:::").issues.map((i) => i.message).join()).toMatch(/参数不合法/);
  });

  it("每一步的文字和讲稿是两句话：讲稿可以不写，写了就单独记着", async () => {
    const scene = await ok(`const a = box("甲")
step("放进 Worker，它碰不到页面了。", () => {
  say("那换个地方跑呢？挪进 Worker，你看，它现在够不着页面了。")
  show(a)
})
step("这一步没有讲稿。", () => { pulse(a) })`);
    expect(scene.steps[0].text).toBe("放进 Worker，它碰不到页面了。");
    expect(scene.steps[0].say).toBe("那换个地方跑呢？挪进 Worker，你看，它现在够不着页面了。");
    expect(scene.steps[1].say).toBeUndefined();
    // 文章页面上用的那一份不带讲稿
    expect(withoutNarration(scene).steps.every((s) => !("say" in s))).toBe(true);
    expect(withoutNarration(scene).steps[0].text).toBe(scene.steps[0].text);

    const twice = await runScene(`const a = box("甲")\nstep("一", () => { say("甲"); say("乙"); show(a) })`);
    expect(!twice.ok && twice.error).toMatch(/一步里只写一个 say/);
    const outside = await runScene(`say("开场白")\nstep("一")`);
    expect(!outside.ok && outside.error).toMatch(/say\(\) 要写在 step/);
  });

  it("讲稿能从代码里整句摘掉，所以括号里只能直接写一个字符串", async () => {
    const code = `step("文字", () => {\n  say("讲的时候说的话，带个 \\"引号\\" 和 (括号)")\n  show(a)\n})\nstep("二", () => { say('第二句'); pulse(a) })`;
    expect(narrationIsLiteral(code)).toBe(true);
    const stripped = stripNarration(code);
    expect(stripped).not.toMatch(/say|讲的时候|第二句/);
    expect(stripped).toBe(`step("文字", () => {\n  show(a)\n})\nstep("二", () => {  pulse(a) })`);

    expect(narrationIsLiteral(`const line = "讲稿"\nstep("一", () => { say(line) })`)).toBe(false);
    expect(narrationIsLiteral(`step("一", () => { say("前半" + "后半") })`)).toBe(false);
    const body = ':::scene\n```js\nconst line = "讲稿"\nconst a = box("甲")\nstep("一", () => { say(line); show(a) })\n```\n:::';
    await runScenes(body);
    expect(parseMarkup(body).issues.map((i) => i.message).join()).toMatch(/say\(\) 的括号里要直接写一句话/);
  });

  it("组件清单里的例子本身能跑通", async () => {
    const example = getComponent("scene")!.example;
    const [result] = Object.values(await runScenes(example));
    expect(parseMarkup(example).issues).toEqual([]);
    // 例子里每一步都写了讲稿，而且没有一句是照抄文字的
    if (!result.ok) throw new Error(result.error);
    expect(result.scene.steps.every((s) => s.say && s.say !== s.text)).toBe(true);
  });
});
