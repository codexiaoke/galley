/**
 * 术语匹配：在文字里找出站点上定义过的术语。浏览器和服务端都用（后台的实时预览也要标出术语），
 * 所以这里不读数据库，术语由调用方传进来（见 services/knowledge.ts 的 listTerms）。
 */

/** 一个术语：来自一个公开的概念块。正文里第一次出现它时，读者可以悬停看定义。 */
export type Term = { id: string; term: string; aliases: string[]; definition: string };

/** 术语的所有写法，长的在前：先匹配"知识图谱"，再匹配"图谱"。 */
export function termSpellings(terms: Term[]): { text: string; id: string }[] {
  const out: { text: string; id: string }[] = [];
  for (const t of terms) {
    const seen = new Set<string>();
    for (const name of [t.term, ...t.aliases]) {
      // "本体（Ontology）"这样带括号的写法，正文里多半只写"本体"或者"Ontology"，两种都算。
      const paren = /^(.+?)\s*[（(]\s*(.+?)\s*[)）]$/.exec(name.trim());
      for (const text of paren ? [name.trim(), paren[1], paren[2]] : [name.trim()]) {
        // 一个字的写法太容易误配，不用
        if ([...text].length < 2 || seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        out.push({ text, id: t.id });
      }
    }
  }
  return out.sort((a, b) => [...b.text].length - [...a.text].length);
}

const LATIN = /[A-Za-z0-9_]/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 在一段文字里找术语出现的位置。英文术语要整词匹配（RDF 不匹配 RDFS 里的 RDF），不分大小写；中文直接匹配。
 * skip 里的术语（已经标过的）不再找。返回位置从前往后排。
 */
export function findTerms(text: string, spellings: { text: string; id: string }[], skip: Set<string> = new Set()) {
  const active = spellings.filter((s) => !skip.has(s.id));
  if (active.length === 0) return [];
  const pattern = new RegExp(active.map((s) => escape(s.text)).join("|"), "gi");
  const found: { start: number; end: number; id: string }[] = [];
  const used = new Set(skip);
  for (const m of text.matchAll(pattern)) {
    const start = m.index;
    const end = start + m[0].length;
    const before = text[start - 1] ?? "";
    const after = text[end] ?? "";
    if (LATIN.test(m[0][0]) && LATIN.test(before)) continue;
    if (LATIN.test(m[0].at(-1)!) && LATIN.test(after)) continue;
    const spelling = active.find((s) => s.text.toLowerCase() === m[0].toLowerCase());
    if (!spelling || used.has(spelling.id)) continue;
    used.add(spelling.id);
    found.push({ start, end, id: spelling.id });
  }
  return found;
}

