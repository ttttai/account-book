import type { HistoryRow } from "./history-row";

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;

// Sakamotoのアルゴリズムで曜日（0=日曜）を求める。Dateを使わずタイムゾーンの影響を受けない
function dayOfWeek(year: number, month: number, day: number): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const adjustedYear = month < 3 ? year - 1 : year;
  return (
    (adjustedYear +
      Math.floor(adjustedYear / 4) -
      Math.floor(adjustedYear / 100) +
      Math.floor(adjustedYear / 400) +
      (offsets[month - 1] ?? 0) +
      day) %
    7
  );
}

// 取引日の見出し。今日と同じ年は「9月8日（火）」、別の年は「2025年12月31日（水）」 (AC-HIS-006-1)
export function formatHistoryDateHeading(
  transactionDate: string,
  today: string,
): string {
  const [year, month, day] = transactionDate.split("-").map(Number);
  const weekday = weekdayLabels[dayOfWeek(year, month, day)] ?? "";
  const yearPrefix =
    transactionDate.slice(0, 4) === today.slice(0, 4) ? "" : `${year}年`;
  return `${yearPrefix}${month}月${day}日（${weekday}）`;
}

export type HistoryDateGroup = Readonly<{
  date: string;
  rows: readonly HistoryRow[];
}>;

// 並び順を保ったまま、連続する同じ取引日の行を1つの日付グループへ束ねる (AC-HIS-006-1)
export function groupHistoryRowsByDate(
  rows: readonly HistoryRow[],
): readonly HistoryDateGroup[] {
  const groups: { date: string; rows: HistoryRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.transactionDate) {
      last.rows.push(row);
    } else {
      groups.push({ date: row.transactionDate, rows: [row] });
    }
  }
  return groups;
}
