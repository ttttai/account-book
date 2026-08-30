// 実在する日付を表すYYYY-MM-DD文字列かを検証する
function isCanonicalCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;

  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

// 外部から渡された初期日付が正当ならそれを、不正ならフォールバック（グループの今日）を返す
export function resolveExpenseInitialDate(
  unsafeDate: unknown,
  fallbackDate: string,
): string {
  return isCanonicalCalendarDate(unsafeDate) ? unsafeDate : fallbackDate;
}
