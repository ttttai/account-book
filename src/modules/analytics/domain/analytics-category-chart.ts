/** 円グラフの1項目。金額はJPY整数で、0円は扇形を持たない */
export type AnalyticsPieItem = Readonly<{
  key: string;
  amountMinor: number;
}>;

/** 1扇形の周回位置。0が12時方向、1で一周し、時計回りに進む */
export type AnalyticsPieSlice = Readonly<{
  key: string;
  startTurn: number;
  endTurn: number;
}>;

/** SVG座標系での円の中心と外径・内径 */
export type AnalyticsPieGeometry = Readonly<{
  centerX: number;
  centerY: number;
  outerRadius: number;
  innerRadius: number;
}>;

function assertPieAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("invalid analytics pie amount");
  }
}

// 金額の合計比から各扇形の開始・終了位置を求める。丸めた構成比ではなく金額で割り、最後の扇形は必ず1で終える (AC-ANA-014-2)
export function layoutAnalyticsPie(
  items: readonly AnalyticsPieItem[],
): readonly AnalyticsPieSlice[] {
  for (const item of items) assertPieAmount(item.amountMinor);
  const positive = items.filter((item) => item.amountMinor > 0);
  const total = positive.reduce((sum, item) => {
    const next = sum + item.amountMinor;
    if (!Number.isSafeInteger(next))
      throw new Error("analytics amount overflow");
    return next;
  }, 0);
  if (total === 0) return [];

  let cumulative = 0;
  return positive.map((item) => {
    const startTurn = cumulative / total;
    cumulative += item.amountMinor;
    return { key: item.key, startTurn, endTurn: cumulative / total };
  });
}

// 座標を小数3桁へ丸め、-0を0へそろえてpath文字列を安定させる
function roundCoordinate(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function pointOnCircle(
  geometry: AnalyticsPieGeometry,
  radius: number,
  turn: number,
): string {
  // 12時方向を開始点にするため、角度を-90度ずらす
  const angle = turn * 2 * Math.PI - Math.PI / 2;
  const x = roundCoordinate(geometry.centerX + radius * Math.cos(angle));
  const y = roundCoordinate(geometry.centerY + radius * Math.sin(angle));
  return `${x} ${y}`;
}

// 扇形をドーナツ状のSVG pathへ変換する。全周は2つの半円で輪として描き、半周超はlarge-arcを立てる (AC-ANA-014-2)
export function describeAnalyticsPieSlice(
  slice: AnalyticsPieSlice,
  geometry: AnalyticsPieGeometry,
): string {
  const { outerRadius: outer, innerRadius: inner } = geometry;
  const span = slice.endTurn - slice.startTurn;

  if (span >= 1) {
    const half = slice.startTurn + 0.5;
    const outerStart = pointOnCircle(geometry, outer, slice.startTurn);
    const outerHalf = pointOnCircle(geometry, outer, half);
    const innerStart = pointOnCircle(geometry, inner, slice.startTurn);
    const innerHalf = pointOnCircle(geometry, inner, half);
    return [
      `M ${outerStart}`,
      `A ${outer} ${outer} 0 1 1 ${outerHalf}`,
      `A ${outer} ${outer} 0 1 1 ${outerStart} Z`,
      `M ${innerStart}`,
      `A ${inner} ${inner} 0 1 0 ${innerHalf}`,
      `A ${inner} ${inner} 0 1 0 ${innerStart} Z`,
    ].join(" ");
  }

  const largeArc = span > 0.5 ? 1 : 0;
  const outerStart = pointOnCircle(geometry, outer, slice.startTurn);
  const outerEnd = pointOnCircle(geometry, outer, slice.endTurn);
  const innerEnd = pointOnCircle(geometry, inner, slice.endTurn);
  const innerStart = pointOnCircle(geometry, inner, slice.startTurn);
  return [
    `M ${outerStart}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEnd}`,
    `L ${innerEnd}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart} Z`,
  ].join(" ");
}
