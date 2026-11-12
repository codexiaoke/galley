import { invalid } from "./errors";

/**
 * 标签的规则。标签由写文章的人（通常是 Agent）自由起，和正文一样经过站长审阅才生效。
 *
 * - 每篇最多 5 个，每个最多 20 个字；
 * - 只能用文字、数字、空格和 + . # - 这几个符号（例如 C#、Node.js），开头必须是文字或数字；
 * - 大小写不同的算同一个（React 和 react），保留第一次写的样子。
 */
export const MAX_TAGS = 5;
const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} +.#-]{0,19}$/u;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (!tag) continue;
    if (!TAG_PATTERN.test(tag)) {
      throw invalid(`标签「${tag}」不合规：最多 20 个字，只能用文字、数字、空格和 + . # - 这几个符号，开头必须是文字或数字。`);
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  if (result.length > MAX_TAGS) throw invalid(`每篇文章最多 ${MAX_TAGS} 个标签，现在有 ${result.length} 个。`);
  return result;
}

/** 两个标签是不是同一个（不分大小写）。 */
export const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** 标签页的网址。 */
export const tagPath = (tag: string) => `/tag/${encodeURIComponent(tag)}`;
