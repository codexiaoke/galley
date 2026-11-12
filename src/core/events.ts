/**
 * 站点里发生的、站长可能想知道的事。核心层在事情发生时发出事件，谁关心谁来听（比如邮件通知）。
 *
 * 听的一方出了任何问题都不能影响正在做的事：发邮件失败了，Agent 的提交仍然是成功的。
 */

export type GalleyEvent =
  | { type: "review_requested"; changeSetId: string; title: string; agentName: string | null }
  | { type: "message_received"; messageId: string; name: string; body: string; fromPath: string | null };

type Listener = (event: GalleyEvent) => void;

// 开发模式下同一个模块可能被加载好几份，监听者挂在 globalThis 上，保证发出和收听的是同一份。
const holder = globalThis as unknown as { __galleyListeners?: Set<Listener> };
const listeners = () => (holder.__galleyListeners ??= new Set());

export function onEvent(listener: Listener): () => void {
  listeners().add(listener);
  return () => listeners().delete(listener);
}

export function emitEvent(event: GalleyEvent) {
  for (const listener of listeners()) {
    try {
      listener(event);
    } catch (e) {
      console.error("[galley] 处理事件时出错", e);
    }
  }
}
