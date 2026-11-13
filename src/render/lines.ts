/**
 * "1,3-5" -> {1,3,4,5}。范围上限 2000 行，防止写错时生成巨大的集合。
 * 单独放一个文件：浏览器里的分步讲解也要用它，不能因此把整个代码高亮器带进页面脚本。
 */
export function parseLineRanges(spec: string): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) continue;
    const from = Number(m[1]);
    const to = Math.min(Number(m[2] ?? m[1]), from + 2000);
    for (let i = from; i <= to; i++) out.add(i);
  }
  return out;
}
