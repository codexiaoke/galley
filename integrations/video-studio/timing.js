/** 一句话说完后留 350 毫秒；画面至少放完这一拍的动画。预览与导出共用。 */
export function beatLength(
  /** @type {{ minMs: number, suggestedMs: number }} */ beat,
  /** @type {{ durationMs: number } | undefined} */ voice,
) {
  return Math.max(beat.minMs, voice ? voice.durationMs + 350 : beat.suggestedMs);
}
