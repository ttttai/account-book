import type { AnalyticsMonthTotals } from "./analytics-summary";

/** 期間開始直前を0円とした各月の累積収支 (ANA-013) */
export type AnalyticsCumulativeBalance = Readonly<{
  month: string;
  balance: number;
  cumulativeBalance: number;
}>;

export type AnalyticsSavingsPoint = Readonly<{
  month: string;
  /** 0〜100の横位置。等間隔に区切った枡の中心で、棒の中心になる */
  x: number;
  /** 0〜100の縦位置。0が最大値、100が最小値で、棒の先端になる */
  y: number;
}>;

export type AnalyticsSavingsChart = Readonly<{
  maxMinor: number;
  minMinor: number;
  /** 0円基準線の縦位置。各棒はここから先端へ伸びる */
  zeroY: number;
  /** 1か月分の枡の幅（0〜100）。棒の太さの上限を決める */
  slotWidth: number;
  points: readonly AnalyticsSavingsPoint[];
}>;

// 符号付き金額の加算でも安全な整数範囲を検証し、桁あふれを例外にする
function safeSignedAdd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new Error("analytics amount overflow");
  }
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error("analytics amount overflow");
  }
  return result;
}

// 月別収支を開始月から順に加算し、取引がない月は前月の累積値を引き継ぐ (AC-ANA-013-1)
export function accumulateAnalyticsBalance(
  months: readonly AnalyticsMonthTotals[],
): readonly AnalyticsCumulativeBalance[] {
  let cumulativeBalance = 0;
  return months.map((month) => {
    cumulativeBalance = safeSignedAdd(cumulativeBalance, month.balance);
    return { month: month.month, balance: month.balance, cumulativeBalance };
  });
}

function roundPosition(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// 0円を必ず含む縦軸で各月を0〜100の座標へ写し、基準線から上下へ伸びる棒に使う (AC-ANA-013-2)
export function scaleAnalyticsSavingsChart(
  balances: readonly AnalyticsCumulativeBalance[],
): AnalyticsSavingsChart {
  const values = balances.map((item) => item.cumulativeBalance);
  const maxMinor = Math.max(0, ...values);
  const minMinor = Math.min(0, ...values);
  const range = maxMinor - minMinor;
  // 全月0円では範囲が0になるため、基準線を中央へ置いて0除算を避ける
  const toY = (value: number): number =>
    range === 0 ? 50 : roundPosition(((maxMinor - value) / range) * 100);
  const slotWidth = balances.length === 0 ? 100 : 100 / balances.length;

  return {
    maxMinor,
    minMinor,
    zeroY: toY(0),
    slotWidth: roundPosition(slotWidth),
    points: balances.map((item, index) => ({
      month: item.month,
      x: roundPosition((index + 0.5) * slotWidth),
      y: toY(item.cumulativeBalance),
    })),
  };
}
