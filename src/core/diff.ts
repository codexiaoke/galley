/**
 * 文字对比：给出"旧正文"和"新正文"，返回逐段的差异，供审阅页显示。
 *
 * 先按段（行）对齐，再在改动过的段落内部细到字词。中文段落往往一整段就是一行，
 * 只做到行级的话，改一个字也会显示成整段删掉又整段加回来，所以段内的对比是必须的。
 */

export type DiffSegment = { kind: "same" | "add" | "del"; text: string };

export type DiffLine =
  | { kind: "same"; text: string }
  | { kind: "add"; text: string }
  | { kind: "del"; text: string }
  /** 这一段被修改了：segments 里依次是没变的、删掉的、加上的文字 */
  | { kind: "change"; segments: DiffSegment[] };

export type TextDiff = { lines: DiffLine[]; added: number; removed: number; changed: boolean };

/** 最长公共子序列的对齐结果：每一步是保留、删除还是新增。 */
function align<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): ("same" | "del" | "add")[] {
  const n = a.length;
  const m = b.length;
  // 两边都很长时直接当作整体替换，避免占用过多内存。正常的文章到不了这个规模。
  if (n * m > 4_000_000) return [...a.map(() => "del" as const), ...b.map(() => "add" as const)];
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = same(a[i], b[j])
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops: ("same" | "del" | "add")[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(a[i], b[j])) {
      ops.push("same");
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push("del");
      i++;
    } else {
      ops.push("add");
      j++;
    }
  }
  while (i++ < n) ops.push("del");
  while (j++ < m) ops.push("add");
  return ops;
}

/** 拆成对比用的最小单位：连续的字母数字算一个词，汉字和标点各自算一个。 */
function tokenize(text: string): string[] {
  return text.match(/[A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s]/gu) ?? [];
}

const length = (text: string) => [...text].length;

/** 两段文字有多少是相同的（0 到 1）。差得太多的两段不值得做段内对比，直接显示成一删一增。 */
function overlap(ops: ("same" | "del" | "add")[]): number {
  if (ops.length === 0) return 1;
  return ops.filter((op) => op === "same").length / ops.length;
}

function diffWithin(before: string, after: string): DiffSegment[] | undefined {
  const a = tokenize(before);
  const b = tokenize(after);
  const ops = align(a, b, (x, y) => x === y);
  if (overlap(ops) < 0.3) return undefined;
  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    const text = op === "add" ? b[j++] : a[i++];
    if (op === "same") j++;
    const last = segments[segments.length - 1];
    if (last && last.kind === op) last.text += text;
    else segments.push({ kind: op, text });
  }
  return segments;
}

export function diffText(before: string, after: string): TextDiff {
  const a = before.split("\n");
  const b = after.split("\n");
  const ops = align(a, b, (x, y) => x === y);

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  let k = 0;
  while (k < ops.length) {
    if (ops[k] === "same") {
      lines.push({ kind: "same", text: a[i] });
      i++;
      j++;
      k++;
      continue;
    }
    // 一段连续的改动：先收集删掉的行和加上的行，再两两配对做段内对比。
    const dels: string[] = [];
    const adds: string[] = [];
    while (k < ops.length && ops[k] !== "same") {
      if (ops[k] === "del") dels.push(a[i++]);
      else adds.push(b[j++]);
      k++;
    }
    const paired = Math.min(dels.length, adds.length);
    for (let p = 0; p < paired; p++) {
      const segments = dels[p].trim() && adds[p].trim() ? diffWithin(dels[p], adds[p]) : undefined;
      if (segments) {
        lines.push({ kind: "change", segments });
        for (const s of segments) {
          if (s.kind === "add") added += length(s.text);
          if (s.kind === "del") removed += length(s.text);
        }
      } else {
        lines.push({ kind: "del", text: dels[p] }, { kind: "add", text: adds[p] });
        removed += length(dels[p]);
        added += length(adds[p]);
      }
    }
    for (const text of dels.slice(paired)) {
      lines.push({ kind: "del", text });
      removed += length(text);
    }
    for (const text of adds.slice(paired)) {
      lines.push({ kind: "add", text });
      added += length(text);
    }
  }
  return { lines, added, removed, changed: lines.some((line) => line.kind !== "same") };
}

/** 收起之后的对比：改动附近的段落，以及中间"这里有几段没有变化"的空档。 */
export type FoldedLine = { kind: "line"; line: DiffLine; index: number } | { kind: "gap"; count: number; index: number };

/**
 * 把离改动远的、没变的段落收起来，只留改动前后各 context 行。
 * 段落之间隔着空行，两行大致是一段。空行本身不计入收起的段数。
 */
export function foldDiff(lines: DiffLine[], context = 2): FoldedLine[] {
  const near = lines.map(() => false);
  lines.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) near[k] = true;
  });
  const out: FoldedLine[] = [];
  let hidden = 0;
  const flush = (index: number) => {
    if (hidden > 0) out.push({ kind: "gap", count: hidden, index });
    hidden = 0;
  };
  lines.forEach((line, i) => {
    if (near[i]) {
      flush(i);
      out.push({ kind: "line", line, index: i });
    } else if (line.kind === "same" && line.text.trim()) {
      hidden++;
    }
  });
  flush(lines.length);
  return out;
}

/** 一句话概括改动的规模，例如"增加 120 字，删去 30 字"。没有改动时返回 undefined。 */
export function describeDiff({ added, removed, changed }: Pick<TextDiff, "added" | "removed" | "changed">): string | undefined {
  if (!changed) return undefined;
  return [added > 0 && `增加 ${added} 字`, removed > 0 && `删去 ${removed} 字`].filter(Boolean).join("，") || "只调整了空行";
}
