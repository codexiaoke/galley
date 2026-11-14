import { visit } from "unist-util-visit";
import { z } from "zod";
import { parseToTree } from "../markup/parse";
import { readScene } from "../markup/structure";
import { evaluate, loadQuickJS, type Dumped } from "../quickjs";
import { normalizeScene } from "./frame";
import { SCENE_PRELUDE } from "./prelude";
import { rememberScene, sceneCache, sceneKey } from "./shared";
import { SCENE_EASES, SCENE_KINDS, SCENE_LIMITS, SCENE_RATIOS, type Scene, type SceneRatio, type SceneResult } from "./types";

/**
 * 运行文章里的场景代码（:::scene）。
 *
 * 和算法演示（algo/trace.ts）一样跑在 QuickJS 里：没有网络、文件、页面，时间和内存都有上限，
 * 每次新建一个环境、用完销毁。只在服务端运行：读者的浏览器拿到的是运行结果（一份动画的清单），
 * 不会执行作者的代码。
 *
 * 沙箱交出来的清单在这里再按格式检查一遍：作者的代码和我们的函数跑在同一个环境里，
 * 它可以把清单改成任何样子，所以不能直接相信。
 */

const TIME_LIMIT_MS = 2000;
const MEMORY_LIMIT = 48 * 1024 * 1024;
const STACK_LIMIT = 1024 * 1024;

const value = z.union([z.number().refine(Number.isFinite), z.string().max(8000)]);
const point = z.tuple([z.number(), z.number()]);
const id = z.string().min(1).max(12);
const sceneSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
  nodes: z
    .array(
      z.object({
        id,
        kind: z.enum(SCENE_KINDS),
        props: z.record(z.string().max(16), value),
        from: z.union([id, point]).optional(),
        to: z.union([id, point]).optional(),
        along: id.optional(),
      }),
    )
    .max(SCENE_LIMITS.nodes * 4),
  steps: z
    .array(
      z.object({
        text: z.string().min(1).max(400),
        say: z.string().min(1).max(600).optional(),
        duration: z.number().min(0).max(120_000),
        tweens: z
          .array(z.object({ id, prop: z.string().max(16), to: value, at: z.number().min(0).max(120_000), dur: z.number().min(0).max(60_000), ease: z.enum(SCENE_EASES) }))
          .max(SCENE_LIMITS.tweens),
      }),
    )
    .min(1)
    .max(SCENE_LIMITS.steps),
});

function describeError(e: Dumped): { error: string; line?: number } {
  const obj = typeof e === "object" && e ? e : { message: String(e) };
  const m = /scene\.js:(\d+)/.exec(obj.stack ?? "");
  const line = m ? Number(m[1]) : undefined;
  let message = obj.message ?? String(e);
  if (message === "interrupted") message = `代码运行超过 ${TIME_LIMIT_MS / 1000} 秒还没结束，可能有死循环。`;
  else if (/out of memory/i.test(message)) message = "代码用的内存太多了。";
  else if (obj.name && obj.name !== "Error") message = `${obj.name}: ${message}`;
  return { error: line !== undefined ? `第 ${line} 行：${message}` : message, line };
}

/** 检查沙箱交出来的清单：格式对不对，提到的编号是不是都存在。 */
function checkScene(raw: unknown): Scene | string {
  const parsed = sceneSchema.safeParse(raw);
  if (!parsed.success) return "场景的数据不完整。不要改名字以两个下划线开头的变量。";
  const scene = parsed.data as Scene;
  const ids = new Set(scene.nodes.map((n) => n.id));
  if (ids.size !== scene.nodes.length) return "场景的数据不完整。不要改名字以两个下划线开头的变量。";
  for (const n of scene.nodes) {
    for (const end of [n.from, n.to, n.along]) {
      if (typeof end === "string" && !ids.has(end)) return "场景的数据不完整：连线指向了不存在的东西。";
    }
    if (n.kind === "link" && (n.from === undefined || n.to === undefined)) return "场景的数据不完整：连线缺少一端。";
  }
  for (const s of scene.steps) for (const tw of s.tweens) if (!ids.has(tw.id)) return "场景的数据不完整：动作指向了不存在的东西。";
  return scene;
}

export async function runScene(code: string, ratio: SceneRatio = "16:9"): Promise<SceneResult> {
  const QuickJS = await loadQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(STACK_LIMIT);
  const deadline = Date.now() + TIME_LIMIT_MS;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    const { w, h } = SCENE_RATIOS[ratio] ?? SCENE_RATIOS["16:9"];
    const stage = evaluate(vm, `var W = ${w}, H = ${h};`, "stage.js");
    if (!stage.ok) return { ok: false, error: "场景环境出错。" };
    const prelude = evaluate(vm, SCENE_PRELUDE, "prelude.js");
    if (!prelude.ok) return { ok: false, error: `场景环境出错：${describeError(prelude.error).error}` };
    const ran = evaluate(vm, code, "scene.js");
    if (!ran.ok) return { ok: false, ...describeError(ran.error) };
    const done = evaluate(vm, "__finish()", "finish.js");
    if (!done.ok) return { ok: false, ...describeError(done.error) };
    const json = String(done.value);
    if (json.length > SCENE_LIMITS.bytes) return { ok: false, error: "场景太大了。减少画面上的东西，或者拆成两个场景。" };
    const scene = checkScene(JSON.parse(json));
    if (typeof scene === "string") return { ok: false, error: scene };
    return { ok: true, scene: normalizeScene(scene) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

/** 正文里所有的场景代码。 */
export function scenesIn(body: string): { key: string; code: string; ratio: SceneRatio }[] {
  const out: { key: string; code: string; ratio: SceneRatio }[] = [];
  visit(parseToTree(body), (node) => {
    if (node.type !== "containerDirective" || (node as { name?: string }).name !== "scene") return;
    const s = readScene(node as never);
    if (s.code === undefined) return;
    out.push({ key: sceneKey(s.code, s.ratio), code: s.code, ratio: s.ratio });
  });
  return out;
}

/**
 * 把正文里的场景代码都运行一遍，结果放进缓存，并按指纹返回。
 * 保存和显示正文之前调用：之后的检查（保存时报出代码的错误）和渲染都从缓存里取。
 */
export async function runScenes(body: string): Promise<Record<string, SceneResult>> {
  const out: Record<string, SceneResult> = {};
  for (const s of scenesIn(body)) {
    let result = sceneCache.get(s.key);
    if (!result) {
      result = await runScene(s.code, s.ratio);
      rememberScene(s.key, result);
    }
    out[s.key] = result;
  }
  return out;
}
