import { runTraces } from "./algo/trace";
import { checkMermaid } from "./markup/mermaid";
import { runScenes } from "./scene/run";

/**
 * 保存正文之前要先做的异步准备：运行演示代码和场景代码、检查 Mermaid 图。
 * 结果都放在缓存里，紧接着的同步检查（saveDocument → parseMarkup）直接取，
 * 这样 Agent 和站长保存时就能看到这些错误，而不是等到页面上才发现。
 * 所有保存正文的地方（MCP 的 save_document / edit_document、后台的保存和实时预览）都先调用它。
 */
export async function prepareBody(body: string) {
  const [traces, scenes] = await Promise.all([runTraces(body), runScenes(body), checkMermaid(body)]);
  return { traces, scenes };
}

/**
 * 显示正文之前要先做的准备：把正文里要在沙箱里跑的代码（算法演示、场景动画）都跑一遍。
 * 跑过的有缓存，不会重复运行。返回的结果交给 Markdown 组件。
 */
export async function prepareRender(body: string) {
  const [traces, scenes] = await Promise.all([runTraces(body), runScenes(body)]);
  return { traces, scenes };
}
