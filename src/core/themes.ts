/**
 * 前台的内置主题。站长在后台"站点设置"里选一套，整个前台换样子。
 *
 * 每套主题只是一组 CSS：颜色、字体，加上栏宽、字号、行距、对齐、标题字重这些版式变量，
 * 再覆盖少量 galley- 的类来改版式。都写在 app/globals.css 的 [data-theme] 一节里，
 * 不涉及任何组件代码，所以加一套新的不用动 React。
 *
 * 想自己加一套（Galley 是开源的，个人站按自己的喜好改很正常）：
 * 1. 在 globals.css 的 [data-theme] 一节里照着 plain 或 engineer 复制一份，改个名字；
 *    浅色写在那一节，深色写在紧跟着的"主题的深色版"里。
 * 2. 回到这个文件，在下面的清单里加一行。
 * 后台的下拉框和校验都读这份清单，加完就能选。
 */
export const THEMES = [
  { name: "paper", label: "书卷", description: "纸张底色、宋体正文、窄栏两端对齐。Galley 默认的样子。" },
  { name: "plain", label: "素白", description: "纯白底、无衬线、宽栏。页眉居中，首页一篇一块。" },
  { name: "engineer", label: "工程", description: "浅灰白、无衬线、行距紧凑。首页是按日期排的索引表。" },
] as const;

export type ThemeName = (typeof THEMES)[number]["name"];

export const DEFAULT_THEME: ThemeName = "paper";

export function isTheme(value: string): value is ThemeName {
  return THEMES.some((t) => t.name === value);
}
