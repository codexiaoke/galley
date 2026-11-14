/**
 * 场景动画（:::scene）的数据。
 *
 * 作者写一段 JavaScript：先摆出画面上的东西（方块、圆、文字、代码、连线），再写若干步，
 * 每一步里说明哪些东西出现、移动、变色，配一句讲解。代码在服务端的沙箱里跑一遍（scene/run.ts），
 * 产出的就是这里的 Scene：一份"每一步里，谁的哪个属性，在什么时候，变成多少"的清单。
 *
 * 读者的浏览器不执行作者的代码，只拿这份清单播放。任意时刻的画面都能直接算出来
 * （scene/frame.ts），所以文章里自动播放、演示里按键推进、导出视频时逐帧渲染用的是同一份数据。
 */

/** 舞台的几种比例，单位是画面自己的坐标（不是像素），页面上整体缩放到栏宽 */
export const SCENE_RATIOS = {
  "16:9": { w: 800, h: 450 },
  "4:3": { w: 800, h: 600 },
  "1:1": { w: 600, h: 600 },
  "21:9": { w: 800, h: 340 },
} as const;
export type SceneRatio = keyof typeof SCENE_RATIOS;
export const SCENE_RATIO_NAMES = Object.keys(SCENE_RATIOS) as [SceneRatio, ...SceneRatio[]];

export const SCENE_KINDS = ["box", "frame", "circle", "text", "code", "link", "packet", "camera", "image", "path"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

/** 颜色只能用这些名字，对应主题里的变量：换主题、换深色模式时画面跟着变 */
export const SCENE_COLORS = ["ink", "soft", "faint", "accent", "paper", "raised", "sunken", "rule", "code", "c1", "c2", "c3", "c4", "c5", "none"] as const;

export const SCENE_EASES = ["out", "in", "inOut", "linear", "back", "type"] as const;
export type SceneEase = (typeof SCENE_EASES)[number];

export type SceneValue = number | string;

export type SceneNode = {
  id: string;
  kind: SceneKind;
  /** 一开始的属性（第一步之前的样子） */
  props: Record<string, SceneValue>;
  /** 连线的两端：另一个东西的编号，或者一个固定的点 */
  from?: string | [number, number];
  to?: string | [number, number];
  /** 小圆点沿着哪条连线走 */
  along?: string;
  /** 读者可以拖的点：它对应哪个参数（见 SceneParam） */
  handle?: string;
  /** 点一下显示的说明 */
  tip?: string;
};

/**
 * 读者能动手调的东西。读者一动，浏览器带着新的数值把场景代码重新跑一遍，画面跟着变。
 * slider 是画面下面的一个滑块，值交给代码里的 param()；handle 是画面上能拖的一个点，位置交给 handle()。
 */
export type SceneParam =
  | { kind: "slider"; name: string; label: string; min: number; max: number; step: number; value: number; initial: number }
  | { kind: "handle"; name: string; node: string; x: number; y: number; minX: number; maxX: number; minY: number; maxY: number; axis: "" | "x" | "y" };

export type SceneTween = {
  id: string;
  prop: string;
  /** 开始时的值。沙箱不给，由 normalizeScene 按顺序推出来 */
  from?: SceneValue;
  to: SceneValue;
  /** 这一步开始后多少毫秒开始 */
  at: number;
  dur: number;
  ease: SceneEase;
};

export type SceneStep = {
  /** 写给读者看的一句话：文章里显示在画面下面，是正文的一部分 */
  text: string;
  /**
   * 讲这一步时说的话（口语的讲稿），和上面那句不是一回事：写出来给人读的句子，照着念出来是不对的。
   * 只在演示里用（字幕、演讲者的提词）。文章页面上不带它（见 scene/shared.ts 的 withoutNarration），
   * 公开的幻灯片接口里也不带（见 render/slides.ts 的 publicSlideSource）。
   */
  say?: string;
  tweens: SceneTween[];
  /** 这一步的动画一共多长（毫秒，1 倍速） */
  duration: number;
};

export type Scene = { w: number; h: number; nodes: SceneNode[]; steps: SceneStep[]; params?: SceneParam[] };

export type SceneResult = { ok: true; scene: Scene } | { ok: false; error: string; line?: number };

export const SCENE_LIMITS = { nodes: 120, steps: 24, tweens: 900, codeLines: 16, bytes: 500_000, params: 6 };
