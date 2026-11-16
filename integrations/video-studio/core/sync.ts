import { validateBeatGuides } from "./guides";
import type { Beat, GuideCue, RemovedBeat, StudioBeat, Voice } from "./types";

/**
 * 来源文章更新后，把工坊里的讲稿、指向、配音对到新的拍点上（见 docs/design-studio-split.md 的"怎么和步骤对上"）。
 *
 * 拍点的 id 会随页码、场景代码变，所以按博客给的锚点对：
 * 1. 锚点相同：讲稿、指向原样保留；
 * 2. 旧来源还没有锚点（第 3 步以前建的项目）：按 id 对。场景的编号来自场景代码，代码一改（比如讲稿迁出时摘掉 say()）就全变了，
 *    所以先把新旧场景对起来：每一步画面上的字一模一样的，认作同一个场景，步骤和元素的编号跟着换过去（legacyScenes）；
 * 3. 步骤的锚点对不上（画面上那句话改了），按"同一场景里的第几步"兜底：保留讲稿，标成"请核对"；
 * 4. 新出现的拍点：讲稿留空，在工坊里写；
 * 5. 消失的拍点：写过讲稿或指向的，收进"已移除"，不悄悄丢掉。
 *
 * 指向的目标也一样：按目标的锚点找到新 id；找不到、或原话已不在讲稿里的指向不再保留，记下条数。
 */
export type SyncResult = { beats: StudioBeat[]; voices: Voice[]; removed: RemovedBeat[]; review: number; added: number; droppedGuides: number };

type Previous = { beat: StudioBeat; original: Beat | undefined };

/** 步骤的 id 是"场景的编号.第几步"，场景元素的 id 是"场景的编号:元素" */
const sceneOf = (id: string) => id.slice(0, id.lastIndexOf("."));

/**
 * 旧项目（没有锚点）的场景编号换算：旧场景编号 → 新场景编号。
 * 按出现的先后，找每一步画面上的字都一样的新场景；找不到的不换，交给后面按"已移除"处理。
 */
function legacyScenes(current: StudioBeat[], next: Beat[]): Map<string, string> {
  const groups = (beats: { id: string; kind: string; anchor?: string; written?: string }[]) => {
    const out = new Map<string, string[]>();
    for (const beat of beats) if (beat.kind === "step" && !beat.anchor) out.set(sceneOf(beat.id), [...(out.get(sceneOf(beat.id)) ?? []), beat.written ?? ""]);
    return out;
  };
  const before = groups(current), after = groups(next.map((beat) => ({ ...beat, anchor: undefined })));
  const map = new Map<string, string>(), taken = new Set<string>();
  for (const [key, written] of before) {
    const found = [...after].find(([candidate, steps]) => !taken.has(candidate) && JSON.stringify(steps) === JSON.stringify(written));
    if (found) { map.set(key, found[0]); taken.add(found[0]); }
  }
  return map;
}

export function matchSource(current: StudioBeat[], originals: Beat[], next: Beat[], voices: Voice[], hash: (text: string) => string): SyncResult {
  const previous: Previous[] = current.map((beat) => ({ beat, original: originals.find((item) => item.id === beat.id) }));
  const used = new Set<Previous>();
  const take = (found: Previous | undefined) => { if (found) used.add(found); return found; };
  const scenes = legacyScenes(current, next);
  /** 旧项目的编号换成新的：步骤 "场景.k"、场景元素 "场景:元素" */
  const renamed = (id: string) => {
    const step = scenes.get(sceneOf(id));
    if (step) return `${step}${id.slice(id.lastIndexOf("."))}`;
    const colon = id.indexOf(":"), target = colon > 0 ? scenes.get(id.slice(0, colon)) : undefined;
    return target ? `${target}${id.slice(colon)}` : id;
  };
  // 先把能按锚点（或旧项目按 id）对上的都对上，再给剩下的步骤兜底，免得兜底抢走了别人的拍点
  const exact = next.map((beat) => take(previous.find((item) => !used.has(item) && (item.beat.anchor ? item.beat.anchor === beat.anchor : renamed(item.beat.id) === beat.id))));
  const fallback = next.map((beat, i) => exact[i] || !beat.fallback ? undefined : take(previous.find((item) => !used.has(item) && item.beat.fallback === beat.fallback)));

  let droppedGuides = 0, review = 0, added = 0;
  const nextVoices: Voice[] = [];
  const beats = next.map((beat, i): StudioBeat => {
    const match = exact[i] ?? fallback[i];
    if (!match) { added++; return { ...beat, text: beat.text ?? "" }; }
    const { beat: old, original } = match;
    // 讲稿归工坊，原样保留；建议时长没在工坊里改过的，跟着博客的新估计走
    const text = old.text;
    const suggestedMs = original && old.suggestedMs === original.suggestedMs ? beat.suggestedMs : old.suggestedMs;
    const guides: GuideCue[] = [];
    for (const guide of old.guides ?? []) {
      const was = old.targets?.find((target) => target.id === guide.targetId);
      // 旧来源的目标没有锚点，按 id 对
      const now = was && beat.targets?.find((target) => was.anchor ? target.anchor === was.anchor : target.id === renamed(was.id));
      try {
        if (!now) throw new Error("目标已移除");
        const moved = { ...guide, targetId: now.id };
        validateBeatGuides({ ...beat, text, guides: [...guides, moved] });
        guides.push(moved);
      } catch { droppedGuides++; }
    }
    const check = fallback[i] ? "fallback" as const : old.check;
    if (fallback[i]) review++;
    const voice = voices.find((item) => item.id === old.id && item.hash === hash(text));
    if (voice) nextVoices.push({ ...voice, id: beat.id });
    return { ...beat, text, suggestedMs, guides, ...(check ? { check } : {}) };
  });
  const removed = previous.filter((item) => !used.has(item) && (item.beat.text || item.beat.guides?.length)).map(({ beat }): RemovedBeat => ({
    id: beat.id, kind: beat.kind, title: beat.title, section: beat.section, written: beat.written, text: beat.text, guides: beat.guides ?? [],
  }));
  return { beats, voices: nextVoices, removed, review, added, droppedGuides };
}

/**
 * 对完以后讲稿这边什么都没变：按顺序每一拍的讲稿、指向、核对标记和配音都一样，没有新增、移除、兜底和丢掉的指向。
 * 画面那边的变化（补上锚点、目标清单、动画时长）不算：讲稿和指向审的是"说什么、指哪里"，
 * 指向还指不指得到，导出前会按新的目标清单再检查一遍；画面细节交给成片审查。
 * 这种情况不用建新版本，也不用重新审查。
 */
export function sameNarration(before: StudioBeat[], beforeVoices: Voice[], after: SyncResult) {
  // 编号不算：每一拍都按锚点或换算后的编号对上了，只是重新编号，讲的内容没变；指向比原话和强调方式，目标已经跟着换过去
  // 建议时长也不算：工坊改过的原样保留，没改过的是博客对画面的估计，和动画时长一样是画面那边的事
  const said = (beats: StudioBeat[]) => canonical(beats.map((beat) => ({ text: beat.text, guides: (beat.guides ?? []).map((guide) => ({ phrase: guide.phrase, emphasis: guide.emphasis })), check: beat.check })));
  const voices = (list: Voice[]) => JSON.stringify(list.map((voice) => [voice.hash, voice.audio]).sort());
  return !after.removed.length && !after.added && !after.review && !after.droppedGuides && said(before) === said(after.beats) && voices(beforeVoices) === voices(after.voices);
}

/** 键按字母排好再转成文字：同样的内容，字段先后不同也算一样 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
    : item);
}
