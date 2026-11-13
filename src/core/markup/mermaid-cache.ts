/**
 * Mermaid 图的检查结果缓存（浏览器和服务端都能引用，这里不引入 Mermaid 本身）。
 *
 * 检查 Mermaid 的写法要加载 Mermaid、是异步的，而正文的检查是同步的：
 * 保存前先把正文里的图都检查一遍（见 mermaid.ts 的 checkMermaid），结果放在这里，
 * 正文检查（parse.ts）直接取。值是错误信息，没有错误时是 null。
 */
const store = globalThis as unknown as { __galleyMermaid?: Map<string, string | null> };
export const mermaidResults: Map<string, string | null> = (store.__galleyMermaid ??= new Map());

const LIMIT = 500;

export function rememberMermaid(code: string, error: string | null) {
  mermaidResults.delete(code);
  mermaidResults.set(code, error);
  while (mermaidResults.size > LIMIT) mermaidResults.delete(mermaidResults.keys().next().value!);
}
