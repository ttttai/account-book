const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseMonth(month: string): Readonly<{ year: number; month: number }> {
  if (!MONTH_PATTERN.test(month)) throw new Error("invalid month");
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
}

function formatMonthStart(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

// 指定した月の集合を覆う半開区間（最小月の初日〜最大月の翌月初日）をYYYY-MM-DDで返す
export function monthlyDateRange(
  months: readonly string[],
): Readonly<{ start: string; endExclusive: string }> {
  if (months.length === 0) {
    throw new Error("monthly range requires at least one month");
  }
  // `YYYY-MM`は固定長のため辞書順比較が時系列比較と一致する
  const sorted = [...months].sort();
  const first = parseMonth(sorted[0] ?? "");
  const last = parseMonth(sorted[sorted.length - 1] ?? "");
  const next =
    last.month === 12
      ? { year: last.year + 1, month: 1 }
      : { year: last.year, month: last.month + 1 };
  return {
    start: formatMonthStart(first.year, first.month),
    endExclusive: formatMonthStart(next.year, next.month),
  };
}
