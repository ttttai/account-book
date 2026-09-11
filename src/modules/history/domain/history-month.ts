// 「YYYY-MM」を月単位でずらす。年跨ぎを含めて2桁の月で返す (AC-HIS-008-4)
export function shiftHistoryMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = year * 12 + (monthNumber - 1) + delta;
  const shiftedYear = Math.floor(monthIndex / 12);
  const shiftedMonth = (monthIndex % 12) + 1;
  return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}`;
}

// OS・ブラウザに依存しない「2026年9月」形式の月ラベル (HIS-008)
export function formatHistoryMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

// グループのタイムゾーン上の日付（YYYY-MM-DD）から今月（YYYY-MM）を得る
export function historyMonthOfDate(date: string): string {
  return date.slice(0, 7);
}
