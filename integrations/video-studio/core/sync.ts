import { validateBeatGuides } from "./guides";
import type { Beat, GuideCue, RemovedBeat, StudioBeat, Voice } from "./types";

/**
 * 来源文章更新后，把工坊里的讲稿、指向、配音对到新的拍点上（见 docs/design-studio-split.md 的"怎么和步骤对上"）。
 *
 * 拍点的 id 会随页码、场景代码变，所以按博客给的锚点对：
 * 1. 锚点相同：讲稿、指向原样保留；
 * 2. 旧来源还没有锚点（第 3 步以前建的项目）：按 id 对，相当于原来的做法；
 * 3. 步骤的锚点对不上（画面上那句话改了），按"同一场景里的第几步"兜底：保留讲稿，标成"请核对"；
 * 4. 新出现的拍点：用文章里的讲稿当初稿（讲稿迁出文章以前）；
 * 5. 消失的拍点：写过讲稿或指向的，收进"已移除"，不悄悄丢掉。
 *
 * 指向的目标也一样：按目标的锚点找到新 id；找不到、或原话已不在讲稿里的指向不再保留，记下条数。
 */
export type SyncResult = { beats: StudioBeat[]; voices: Voice[]; removed: RemovedBeat[]; review: number; added: number; droppedGuides: number };

type Previous = { beat: StudioBeat; original: Beat | undefined };

export function matchSource(current: StudioBeat[], originals: Beat[], next: Beat[], voices: Voice[], hash: (text: string) => string): SyncResult {
  const previous: Previous[] = current.map((beat) => ({ beat, original: originals.find((item) => item.id === beat.id) }));
  const used = new Set<Previous>();
  const take = (found: Previous | undefined) => { if (found) used.add(found); return found; };
  // 先把能按锚点（或旧项目按 id）对上的都对上，再给剩下的步骤兜底，免得兜底抢走了别人的拍点
  const exact = next.map((beat) => take(previous.find((item) => !used.has(item) && (item.beat.anchor ? item.beat.anchor === beat.anchor : item.beat.id === beat.id))));
  const fallback = next.map((beat, i) => exact[i] || !beat.fallback ? undefined : take(previous.find((item) => !used.has(item) && item.beat.fallback === beat.fallback)));

  let droppedGuides = 0, review = 0, added = 0;
  const nextVoices: Voice[] = [];
  const beats = next.map((beat, i): StudioBeat => {
    const match = exact[i] ?? fallback[i];
    if (!match) { added++; return { ...beat }; }
    const { beat: old, original } = match;
    // 工坊没改过的讲稿和时长跟着文章走；改过的保留
    const text = original && old.text === original.text ? beat.text : old.text;
    const suggestedMs = original && old.suggestedMs === original.suggestedMs ? beat.suggestedMs : old.suggestedMs;
    const guides: GuideCue[] = [];
    for (const guide of old.guides ?? []) {
      const was = old.targets?.find((target) => target.id === guide.targetId);
      // 旧来源的目标没有锚点，按 id 对
      const now = was && beat.targets?.find((target) => was.anchor ? target.anchor === was.anchor : target.id === was.id);
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

/** 对完以后什么都没变（只是补上了锚点、换了来源的内容指纹）：不用建新版本，也不用重新审查 */
export function sameNarration(before: StudioBeat[], beforeVoices: Voice[], after: SyncResult) {
  // 锚点不算：旧项目补上锚点不是改动
  const plain = (beats: StudioBeat[]) => canonical(beats.map((beat) => ({ ...beat, anchor: undefined, fallback: undefined, guides: beat.guides ?? [], targets: beat.targets?.map((target) => ({ ...target, anchor: undefined })) })));
  const voices = (list: Voice[]) => JSON.stringify(list.map((voice) => [voice.id, voice.hash, voice.audio]).sort());
  return !after.removed.length && !after.added && !after.review && !after.droppedGuides && plain(before) === plain(after.beats) && voices(beforeVoices) === voices(after.voices);
}

/** 键按字母排好再转成文字：同样的内容，字段先后不同也算一样 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
    : item);
}
