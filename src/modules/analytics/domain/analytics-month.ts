/** 期間サマリーで一度に扱える上限月数 (AC-ANA-012-2) */
export const MAX_ANALYTICS_MONTHS = 24;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

// `YYYY-MM`の正規表記かを判定する
export function isAnalyticsMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

function parseMonth(month: string): Readonly<{ year: number; month: number }> {
  if (!isAnalyticsMonth(month)) throw new Error("invalid analytics month");
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
}

function formatMonth(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

// 前月または翌月の`YYYY-MM`を返す
export function shiftAnalyticsMonth(month: string, offset: -1 | 1): string {
  const value = parseMonth(month);
  const shifted = value.month + offset;
  if (shifted < 1) return formatMonth(value.year - 1, 12);
  if (shifted > 12) return formatMonth(value.year + 1, 1);
  return formatMonth(value.year, shifted);
}

// 期間内の月を昇順で列挙する。不正な月・逆順・上限超過はnullを返してfail closedにする
export function listAnalyticsMonths(
  startMonth: string,
  endMonth: string,
): readonly string[] | null {
  if (!isAnalyticsMonth(startMonth) || !isAnalyticsMonth(endMonth)) return null;
  // `YYYY-MM`は固定長のため辞書順比較が時系列比較と一致する
  if (startMonth > endMonth) return null;

  const months: string[] = [];
  let month = startMonth;
  while (month <= endMonth) {
    if (months.length >= MAX_ANALYTICS_MONTHS) return null;
    months.push(month);
    month = shiftAnalyticsMonth(month, 1);
  }
  return months;
}

// 表示用の年月ラベルへ整える
export function formatAnalyticsMonth(month: string): string {
  const value = parseMonth(month);
  return `${value.year}年${value.month}月`;
}
