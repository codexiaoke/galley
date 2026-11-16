import type { StudioBeat } from "./types";

/**
 * 讲稿检查：写讲稿时容易犯、听成片才发现的几类问题（规则见 skills/studio/SKILL.md 的"写讲稿"）。
 * 只提醒，不拦着提交：每一条都可能有例外，由写的人和审的人判断。
 */
export type NarrationCheck = { beatId: string; code: "empty" | "repeat" | "polyphone" | "blank-frame"; message: string };

/**
 * 配音模型容易读错的词，和不会读错的说法。只收确实读错过的，宁缺毋滥：
 * 收得太宽，每篇都是一堆提醒，真正的问题就被淹掉了。
 */
export const POLYPHONES: { word: string; instead: string }[] = [
  { word: "热重载", instead: "热更新" },
  { word: "重载", instead: "重新加载" },
  { word: "重启", instead: "重新启动" },
];

/** 比较两句话时不看标点、空白和大小写 */
const plain = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** 按句号、问号、感叹号、分号、逗号断开，太短的片段（"对，"）不算 */
const clauses = (text: string) => text.split(/[。！？!?；;，,…]+/).map(plain).filter((part) => part.length >= 6);

/** 页的开场和紧跟着的第一步是连着播的：有一句说了两遍就提醒 */
function repeated(opening: string, step: string) {
  const later = plain(step);
  return clauses(opening).find((part) => later.includes(part));
}

/** 页后面紧跟着这一页的场景步骤：这一页是场景页 */
const sceneSteps = (beats: StudioBeat[], i: number) => {
  const page = beats[i];
  const steps: StudioBeat[] = [];
  for (const beat of beats.slice(i + 1)) {
    if (beat.kind !== "step" || beat.page !== page.page) break;
    steps.push(beat);
  }
  return steps;
};

export function narrationChecks(beats: StudioBeat[]): NarrationCheck[] {
  const checks: NarrationCheck[] = [];
  beats.forEach((beat, i) => {
    const steps = beat.kind === "page" ? sceneSteps(beats, i) : [];
    // 空着的拍：封面、结尾、场景页本身（亮个相就开始走步骤）可以不写；文字页和场景的每一步要写
    if (!beat.text.trim() && (beat.kind === "step" || (beat.kind === "page" && !steps.length && !beat.selfPaced))) {
      checks.push({ beatId: beat.id, code: "empty", message: "这一拍还没有讲稿，成片里会是一段没有声音的画面。" });
    }
    // 开场和第一步说了同一句
    if (beat.kind === "page" && beat.text && steps[0]?.text) {
      const same = repeated(beat.text, steps[0].text);
      if (same) checks.push({ beatId: steps[0].id, code: "repeat", message: "这一步和这一页的开场说了同一句话，两拍是连着播的，删掉一处。" });
    }
    // 第一拍时场景画面是空的：场景在第一步之前什么都没摆出来，开场那几秒观众看到的是一张白纸
    if (steps.length) {
      const scene = steps[0].id.slice(0, steps[0].id.lastIndexOf("."));
      if (!beat.targets?.some((target) => target.id.startsWith(`${scene}:`))) {
        checks.push({ beatId: beat.id, code: "blank-frame", message: "这一页的场景在第一步之前是空的，开场时画面上什么都没有。请在文章里让场景在第一个 step 之前先 show 出起点。" });
      }
    }
    // 会读错的多音字（长的词先查，"热重载"不再按"重载"报一遍）
    let rest = beat.text;
    for (const { word, instead } of POLYPHONES) {
      if (!rest.includes(word)) continue;
      checks.push({ beatId: beat.id, code: "polyphone", message: `讲稿里的"${word}"配音容易读错，换成"${instead}"。` });
      rest = rest.split(word).join("");
    }
  });
  return checks;
}
