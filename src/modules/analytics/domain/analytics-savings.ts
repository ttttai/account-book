import type { AnalyticsMonthTotals } from "./analytics-summary";

/** 期間開始直前を0円とした各月の累積収支 (ANA-013) */
export type AnalyticsCumulativeBalance = Readonly<{
  month: string;
  balance: number;
  cumulativeBalance: number;
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
