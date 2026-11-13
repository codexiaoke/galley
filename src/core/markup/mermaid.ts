import { visit } from "unist-util-visit";
import { mermaidResults, rememberMermaid } from "./mermaid-cache";
import { parseToTree } from "./parse";

/**
 * 保存前检查正文里的 Mermaid 图写得对不对，只在服务端用。
 *
 * Mermaid 是给浏览器写的，在服务端只用它的 parse（检查写法，不画图）。
 * 有几种图在检查时会调用 DOMPurify（清理网页代码的库），而 DOMPurify 离开浏览器就是个空壳，
 * 所以这里给它补上几个什么都不做的函数。只检查写法、不生成网页，用不着它的清理。
 * 读者的浏览器里画图时用的是浏览器自己的那份 Mermaid 和 DOMPurify，不受影响。
 */

type Mermaid = { parse: (text: string) => Promise<unknown>; initialize: (config: object) => void };

let loading: Promise<Mermaid> | undefined;

function loadMermaid(): Promise<Mermaid> {
  loading ??= (async () => {
    const purify = (await import("dompurify")).default as unknown as Record<string, unknown>;
    if (typeof purify.addHook !== "function") {
      Object.assign(purify, {
        addHook() {},
        removeHook() {},
        removeHooks() {},
        removeAllHooks() {},
        sanitize: (s: unknown) => String(s),
      });
    }
    const mermaid = (await import("mermaid")).default as unknown as Mermaid;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    return mermaid;
  })();
  return loading;
}

/** 把 Mermaid 的英文报错整理成一句：保留行号和出错的位置，去掉多余的空行 */
function describe(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  const lines = text.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  const where = /line (\d+)/i.exec(text);
  const body = lines.slice(0, 3).join(" ");
  return where ? `图的第 ${Number(where[1])} 行附近写错了：${body}` : `图写错了：${body}`;
}

/** 检查正文里所有的 Mermaid 图，结果放进缓存（见 mermaid-cache.ts），正文检查时直接取。 */
export async function checkMermaid(body: string): Promise<void> {
  const codes: string[] = [];
  visit(parseToTree(body), "code", (node) => {
    if (node.lang === "mermaid" && !mermaidResults.has(node.value)) codes.push(node.value);
  });
  if (codes.length === 0) return;
  const mermaid = await loadMermaid();
  for (const code of codes) {
    try {
      await mermaid.parse(code);
      rememberMermaid(code, null);
    } catch (e) {
      rememberMermaid(code, describe(e));
    }
  }
}
