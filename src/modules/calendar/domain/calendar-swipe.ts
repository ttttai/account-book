export type SwipeMonthOffset = -1 | 1;

/** カレンダー幅に対する最小の水平移動比率 */
const minimumWidthRatio = 0.2;
/** 狭い画面でも要求する最小の水平移動量（CSS pixel） */
const minimumDistancePx = 48;
/** 縦スクロールと区別するため、水平移動量に要求する垂直移動量との比 */
const horizontalDominance = 1.5;

// pointerの移動量とカレンダー幅から、スワイプが月移動に該当するか（前月-1・翌月+1）を判定する純関数 (AC-CAL-015-2)
export function resolveSwipeMonthOffset(
  input: Readonly<{ deltaX: number; deltaY: number; width: number }>,
): SwipeMonthOffset | undefined {
  if (!Number.isFinite(input.width) || input.width <= 0) return undefined;
  if (!Number.isFinite(input.deltaX) || !Number.isFinite(input.deltaY)) {
    return undefined;
  }

  const horizontal = Math.abs(input.deltaX);
  const vertical = Math.abs(input.deltaY);
  const threshold = Math.max(
    input.width * minimumWidthRatio,
    minimumDistancePx,
  );

  if (horizontal < threshold) return undefined;
  if (horizontal < vertical * horizontalDominance) return undefined;

  // 左へ動かすと翌月、右へ動かすと前月
  return input.deltaX < 0 ? 1 : -1;
}
