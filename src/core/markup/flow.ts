/**
 * 流程图的写法：列表里每一项是一条连线。
 *   甲 -> 乙
 *   甲 -> 乙: 说明      （英文冒号后面要有空格，或者用中文冒号）
 *   甲 -> 乙 -> 丙      （连写，不带说明）
 *   甲                  （单独的节点）
 * 节点按第一次出现的顺序排列。保存时用它检查写法，页面上用它画图，两边是同一套规则。
 */

export type FlowGraph = {
  nodes: string[];
  edges: { from: number; to: number; label?: string }[];
};

export const FLOW_MAX_NODES = 12;
const NODE_MAX_LENGTH = 24;

export type FlowParseResult = { graph: FlowGraph; errors: string[] };

export function parseFlow(lines: string[]): FlowParseResult {
  const nodes: string[] = [];
  const edges: FlowGraph["edges"] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const node = (raw: string, line: string): number | null => {
    const name = raw.trim();
    if (!name) {
      errors.push(`「${line}」里有一段箭头前后没有节点名字。`);
      return null;
    }
    if (name.length > NODE_MAX_LENGTH) errors.push(`节点名字「${name}」太长了，最多 ${NODE_MAX_LENGTH} 个字。`);
    let index = nodes.indexOf(name);
    if (index === -1) {
      index = nodes.push(name) - 1;
    }
    return index;
  };

  for (const original of lines) {
    const line = original.trim();
    if (!line) continue;
    const parts = line.split(/\s*->\s*/);
    let label: string | undefined;
    if (parts.length >= 2) {
      // 说明写在最后一个节点的冒号后面：中文冒号，或者英文冒号加空格（这样 localhost:3000 不会被拆开）。
      const last = parts[parts.length - 1];
      const m = /^(.*?)(?:\s*：\s*|:\s+)(.+)$/.exec(last);
      if (m) {
        if (parts.length > 2) errors.push(`「${line}」连写了多段箭头，又带了说明。带说明的连线要分开写，一行一条。`);
        parts[parts.length - 1] = m[1];
        label = m[2].trim();
      }
    }
    const ids = parts.map((p) => node(p, line));
    if (ids.some((i) => i === null)) continue;
    for (let i = 0; i + 1 < ids.length; i++) {
      const from = ids[i]!;
      const to = ids[i + 1]!;
      if (from === to) {
        errors.push(`「${line}」里的节点指向了自己。`);
        continue;
      }
      const key = `${from}->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to, label: ids.length === 2 ? label : undefined });
    }
  }

  if (nodes.length === 0) errors.push("流程图里没有内容。写一个列表，每项一条连线，例如「- 甲 -> 乙」。");
  if (nodes.length > FLOW_MAX_NODES) errors.push(`流程图最多 ${FLOW_MAX_NODES} 个节点，现在有 ${nodes.length} 个。拆成两张图，或者合并一些环节。`);
  return { graph: { nodes, edges }, errors };
}
