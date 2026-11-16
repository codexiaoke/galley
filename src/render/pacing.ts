/**
 * 演示自己走的时候，一页停多久（毫秒）：按页面上的字数，每秒 7 个字，3.5 到 14 秒之间。
 * 视频工坊会给出每一拍的时长（网址参数 timing），那时不用这个估计。
 */
export function defaultPageStay(textChars: number): number {
  return Math.min(14000, Math.max(3500, (textChars * 1000) / 7));
}
