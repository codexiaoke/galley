/**
 * 演示和视频里的字幕。
 *
 * 讲稿一说就是两三句，整段放上去会排成一大块，压住画面。字幕一次只放一小段：
 * 按句子断开，太长的句子再按逗号断，每段在横屏上正好一行。几段按各自的长短分摊这句讲稿的时间，依次出现。
 */

/** 一段字幕最多多宽（按汉字算，字母数字算半个）。横屏上 34 个字正好一行 */
export const CAPTION_LIMIT = 34;

/** 一段文字有多宽：汉字算一个，字母、数字、空格算半个 */
export function captionWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.codePointAt(0)! > 0x2e7f ? 1 : 0.5;
  return w;
}

const SENTENCE_END = "。！？!?；;…";
const CLAUSE_END = "，、,：:";
const CLOSERS = "”’」』）)》\"'";

/** 在这些标点后面断开；标点后面跟着的引号、括号留在前一段里 */
function splitAfter(text: string, marks: string): string[] {
  const out: string[] = [];
  let current = "";
  const chars = [...text];
  chars.forEach((ch, i) => {
    current += ch;
    const next = chars[i + 1];
    const closing = marks.includes(ch) || (CLOSERS.includes(ch) && current.length > 1 && marks.includes(current[current.length - 2]));
    // 连着的标点（？！、……）和后面的引号不拆开；小数点、网址里的点不算句子结束
    if (closing && !(next && (marks.includes(next) || CLOSERS.includes(next))) && !(next && /[0-9A-Za-z]/.test(next) && /[.,:;]/.test(ch))) {
      out.push(current);
      current = "";
    }
  });
  if (current.trim()) out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** 没有标点可断的长句：按宽度硬切，尽量不把英文单词切开 */
function hardWrap(text: string, limit: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const ch of text) {
    if (captionWidth(current + ch) > limit) {
      const space = current.lastIndexOf(" ");
      const cut = /[0-9A-Za-z]/.test(ch) && space > 0 ? space : current.length;
      out.push(current.slice(0, cut).trim());
      current = current.slice(cut).trimStart();
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** 相邻的几小段，合起来不超过一行的就并在一起 */
function pack(pieces: string[], limit: number): string[] {
  const out: string[] = [];
  for (const piece of pieces) {
    const last = out[out.length - 1];
    if (last !== undefined && captionWidth(last + piece) <= limit) out[out.length - 1] = last + piece;
    else out.push(piece);
  }
  return out;
}

/** 把一句讲稿拆成依次显示的几段字幕 */
export function captionParts(text: string, limit = CAPTION_LIMIT): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = splitAfter(clean, SENTENCE_END).flatMap((sentence) => {
    if (captionWidth(sentence) <= limit) return [sentence];
    return pack(splitAfter(sentence, CLAUSE_END).flatMap((clause) => (captionWidth(clause) <= limit ? [clause] : hardWrap(clause, limit))), limit);
  });
  // 一段字幕末尾的逗号、顿号不要：下一段马上接上
  return pack(sentences, limit).map((part) => part.replace(/[，、,：:]+$/, ""));
}

/** 把这句话说完大概要多久（毫秒，正常语速）。有讲稿的步骤按这个时间停留 */
export function speakingTime(text: string): number {
  return Math.max(1500, 500 + captionWidth(text.replace(/\s+/g, "")) * 210);
}

/** 一页不给时长时停多久（毫秒）：有讲稿按讲稿的字数，没有按页面文字的字数，每秒 7 个字，3.5 到 14 秒之间 */
export function defaultPageStay(notesChars: number, textChars: number): number {
  return Math.min(14000, Math.max(3500, ((notesChars || textChars) * 1000) / 7));
}
