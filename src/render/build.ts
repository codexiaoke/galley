/**
 * 演示里一页的内容一条一条出现。
 *
 * 一页上能"走一步"的东西按出现的先后排成一列：
 * - 文字（段落、列表的每一项、引文、提示框、表格）：除了第一条，其余先藏着，轮到它时出现；
 * - 播放器（代码演变、算法动画、场景动画）：轮到它时，它自己的每一步各算一步。
 *
 * 按"下一步"时从头往后找，第一个还能往前走的走一步；都走完了，才翻到下一页。
 * 按"上一步"时从后往前找，原路退回去。
 *
 * 这里只管顺序，不碰页面：页面上怎么藏、怎么显示由 present.tsx 接上。
 */

export type BuildState = "first" | "pending" | "shown";

export type BuildUnit = {
  type: "unit";
  /** first：一进这一页就在；pending：还没轮到；shown：已经出现 */
  state: BuildState;
  /** 以冒号结尾，是在引出下一条：和下一条一起出现 */
  lead: boolean;
  /** 有多少个字，自动播放时按它分摊这一页的时间 */
  chars: number;
  /** 状态变了，通知页面 */
  apply: (state: BuildState) => void;
};
export type PlayerStep = { wait?: number; caption?: string };
export type BuildPlayer = { type: "player"; step: (dir: number) => PlayerStep | null };
export type BuildStop = BuildUnit | BuildPlayer;

/** 走了一步之后的结果：出现了多少字的文字，或者播放器走了一步 */
export type BuildResult = { chars: number } | { player: PlayerStep };

/** 这段文字是不是在引出下一条：以冒号结尾（"原因有三个："） */
export const leadsOn = (text: string) => /[：:]\s*$/.test(text);

/**
 * 一页里的文字一开始各是什么状态。leads 是每一条是不是下一条的引子
 * （以冒号结尾，而且页面上紧挨着的就是下一条文字；后面跟着的是代码或图时不算）。
 * 只有一条时不分步；第一条一进来就在，它是引子时下一条也跟着在。
 */
export function planBuild(leads: boolean[]): { state: BuildState; lead: boolean }[] {
  if (leads.length < 2) return [];
  let open = true;
  return leads.map((lead) => {
    const state: BuildState = open ? "first" : "pending";
    open = open && lead;
    return { state, lead };
  });
}

const set = (unit: BuildUnit, state: BuildState) => {
  unit.state = state;
  unit.apply(state);
};

/** 往前（dir > 0）或往回走一步。没有东西可走时返回 null，由演示去翻页 */
export function advance(stops: BuildStop[], dir: number): BuildResult | null {
  if (dir > 0) {
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (stop.type === "player") {
        const step = stop.step(1);
        if (step) return { player: step };
        continue;
      }
      if (stop.state !== "pending") continue;
      let chars = 0;
      // 引子和它引出的那一条一起出现
      for (let j = i; j < stops.length; j++) {
        const unit = stops[j];
        if (unit.type !== "unit" || unit.state !== "pending") break;
        set(unit, "shown");
        chars += unit.chars;
        if (!unit.lead) break;
      }
      return { chars };
    }
    return null;
  }
  for (let i = stops.length - 1; i >= 0; i--) {
    const stop = stops[i];
    if (stop.type === "player") {
      const step = stop.step(-1);
      if (step) return { player: step };
      continue;
    }
    if (stop.state !== "shown") continue;
    set(stop, "pending");
    // 一起出现的引子也一起收回去
    for (let j = i - 1; j >= 0; j--) {
      const before = stops[j];
      if (before.type !== "unit" || before.state !== "shown" || !before.lead) break;
      set(before, "pending");
    }
    return { chars: 0 };
  }
  return null;
}
