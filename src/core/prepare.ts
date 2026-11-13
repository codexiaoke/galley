import { runTraces } from "./algo/trace";
import { checkMermaid } from "./markup/mermaid";

/**
 * 保存正文之前要先做的异步准备：运行演示代码、检查 Mermaid 图。
 * 结果都放在缓存里，紧接着的同步检查（saveDocument → parseMarkup）直接取，
 * 这样 Agent 和站长保存时就能看到这些错误，而不是等到页面上才发现。
 * 所有保存正文的地方（MCP 的 save_document / edit_document、后台的保存和实时预览）都先调用它。
 */
export async function prepareBody(body: string) {
  const [traces] = await Promise.all([runTraces(body), checkMermaid(body)]);
  return { traces };
}
