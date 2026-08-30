import type { WeeklyRange } from "./week-range";

export type WeeklyExpenseSummary = Readonly<{
  totalMinor: number;
  transactionCount: number;
  previousTotalMinor: number;
  categories: readonly Readonly<{
    name: string;
    amountMinor: number;
    transactionCount: number;
  }>[];
}>;

// JPYの整数を3桁区切りの文字列にする。浮動小数点を経由しない
function formatYen(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("INVALID_AMOUNT");
  const sign = amountMinor < 0 ? "-" : "";
  const digits = Math.abs(amountMinor).toString();
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}円`;
}

// YYYY-MM-DDを表示用のM/Dにする
function formatDisplayDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}`;
}

// 週次通知のテキスト本文を組み立てる (NOTIF-002, AC-NOTIF-001-2)
export function buildWeeklySummaryMessage(
  summary: WeeklyExpenseSummary,
  range: WeeklyRange,
): string {
  const heading = `【わが家計】今週のまとめ (${formatDisplayDate(range.weekStart)}〜${formatDisplayDate(range.weekEnd)})`;

  if (summary.transactionCount === 0) {
    return `${heading}\n今週の支出登録はありませんでした。`;
  }

  // 前週比は減少を▲、増加を+で表す
  const difference = summary.totalMinor - summary.previousTotalMinor;
  const differenceLabel =
    difference <= 0
      ? `▲${formatYen(-difference)}`
      : `+${formatYen(difference)}`;

  const lines = [
    heading,
    `支出合計: ${formatYen(summary.totalMinor)} (${summary.transactionCount}件)`,
    `先週: ${formatYen(summary.previousTotalMinor)} (${differenceLabel})`,
    "",
    ...summary.categories.map(
      (category) =>
        `・${category.name}: ${formatYen(category.amountMinor)} (${category.transactionCount}件)`,
    ),
  ];
  return lines.join("\n");
}
