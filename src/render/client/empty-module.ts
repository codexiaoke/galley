/**
 * 空模块。QuickJS 的单文件版本里有一段只在 Node.js 下才走到的 require("fs")，
 * 打包给浏览器时把 fs 指到这里（见 next.config.ts 的 resolveAlias），浏览器里用不到它。
 */
export {};
