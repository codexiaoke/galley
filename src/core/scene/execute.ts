import { z } from "zod";
import { evaluate, loadQuickJS, type Dumped } from "../quickjs";
import { normalizeScene } from "./frame";
import { SCENE_PRELUDE } from "./prelude";
import { SCENE_EASES, SCENE_KINDS, SCENE_LIMITS, SCENE_RATIOS, type Scene, type SceneRatio, type SceneResult } from "./types";

/**
 * 运行场景代码（:::scene）。
 *
 * 和算法演示（algo/trace.ts）一样跑在 QuickJS 里：没有网络、文件、页面，时间和内存都有上限，
 * 每次新建一个环境、用完销毁。
 *
 * 平时只在服务端运行一次，读者的浏览器拿到的是运行结果（一份动画的清单）。
 * 场景里有读者能调的东西（滑块、能拖的点）时，读者一动，浏览器会带着新的数值把代码再跑一遍
 * （render/client/scene-worker.ts）：跑的还是这个文件，还是在 QuickJS 里，而且在后台线程里，
 * 作者的代码始终碰不到页面。所以这个文件不能引入只有服务端才有的东西（正文的解析、数据库）。
 *
 * 沙箱交出来的清单在这里再按格式检查一遍：作者的代码和我们的函数跑在同一个环境里，
 * 它可以把清单改成任何样子，所以不能直接相信。
 */

const TIME_LIMIT_MS = 2000;
const MEMORY_LIMIT = 48 * 1024 * 1024;
const STACK_LIMIT = 1024 * 1024;

const value = z.union([z.number().refine(Number.isFinite), z.string().max(8000)]);
const finite = z.number().refine(Number.isFinite);
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
        handle: z.string().max(18).optional(),
        tip: z.string().min(1).max(240).optional(),
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
  params: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("slider"), name: z.string().max(18), label: z.string().max(40), min: finite, max: finite, step: finite, value: finite, initial: finite }),
        z.object({ kind: z.literal("handle"), name: z.string().max(18), node: id, x: finite, y: finite, minX: finite, maxX: finite, minY: finite, maxY: finite, axis: z.enum(["", "x", "y"]) }),
      ]),
    )
    .max(SCENE_LIMITS.params)
    .optional(),
});

function describeError(e: Dumped): { error: string; line?: number } {
  const obj = typeof e === "object" && e ? e : { message: String(e) };
  const m = /scene\.js:(\d+)/.exec(obj.stack ?? "");
  const line = m ? Number(m[1]) : undefined;
  let message = obj.message ?? String(e);
  if (message === "interrupted") message = "代码运行太久还没结束，可能有死循环。";
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

export type RunSceneOptions = {
  /** 读者调过的数值：滑块是 名字 -> 数，能拖的点是 名字_x、名字_y */
  values?: Record<string, number>;
  /** 固定全景的镜头：读者拖动时画面的取景不跟着变（不然一边拖，整个画面一边缩放） */
  home?: { x: number; y: number; zoom: number };
  /** 最多跑多久（毫秒）。读者拖动时重新运行给得短一些 */
  timeLimit?: number;
};

export async function runScene(code: string, ratio: SceneRatio = "16:9", options: RunSceneOptions = {}): Promise<SceneResult> {
  const QuickJS = await loadQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(STACK_LIMIT);
  const limit = Math.min(TIME_LIMIT_MS, options.timeLimit ?? TIME_LIMIT_MS);
  const deadline = Date.now() + limit;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    const { w, h } = SCENE_RATIOS[ratio] ?? SCENE_RATIOS["16:9"];
    // 只把数字交进去：这些值来自读者的浏览器
    const values = Object.fromEntries(Object.entries(options.values ?? {}).filter(([k, v]) => /^[A-Za-z][A-Za-z0-9_]{0,17}$/.test(k) && typeof v === "number" && Number.isFinite(v)));
    const home = options.home && [options.home.x, options.home.y, options.home.zoom].every(Number.isFinite) ? { x: options.home.x, y: options.home.y, zoom: options.home.zoom } : null;
    const stage = evaluate(vm, `var W = ${w}, H = ${h}; var __params = ${JSON.stringify(values)}; var __homeFixed = ${JSON.stringify(home)};`, "stage.js");
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
