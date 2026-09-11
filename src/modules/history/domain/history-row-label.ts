import { formatHistoryJpy } from "./history-jpy";
import type { HistoryRow } from "./history-row";

// 内訳の要約。2人以上へ配分された支出だけ「2人で分割」とし、1人と収入は表示しない (AC-HIS-006-2)
export function summarizeHistoryAllocations(
  row: HistoryRow,
): string | undefined {
  if (row.type !== "expense" || row.allocations.length < 2) return undefined;
  return `${row.allocations.length}人で分割`;
}

// 行リンクのアクセシブル名。日付・カテゴリ・金額を基本に、対象者の支出額・受取者・メモを補う (AC-HIS-006-3)
export function buildHistoryRowAccessibleName(
  row: HistoryRow,
  dateHeading: string,
  targetMemberName?: string,
): string {
  const parts = [dateHeading, row.categoryName];
  if (row.targetAmountMinor !== undefined) {
    parts.push(
      `${targetMemberName ?? "対象"}の支出`,
      formatHistoryJpy(row.targetAmountMinor),
      "取引全体",
      formatHistoryJpy(row.amountMinor),
    );
  } else if (row.type === "income") {
    parts.push("収入", formatHistoryJpy(row.amountMinor));
  } else {
    parts.push(formatHistoryJpy(row.amountMinor));
  }
  if (row.type === "income") parts.push(`受取者 ${row.partyDisplayName}`);
  if (row.memo) parts.push(row.memo);
  return parts.join(" ");
}
