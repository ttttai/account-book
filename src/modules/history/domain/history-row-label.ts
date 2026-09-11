import { formatHistoryJpy } from "./history-jpy";
import type { HistoryRow } from "./history-row";

// 支出した人（負担メンバー）の表示名だけを「・」で連結する。見出し語・各人の金額は出さず、収入には返さない (AC-HIS-007-1)
export function describeHistorySpenders(row: HistoryRow): string | undefined {
  if (row.type !== "expense" || row.allocations.length === 0) return undefined;
  return row.allocations.map((allocation) => allocation.displayName).join("・");
}

// 支出なら支出した人の表示名、収入なら「受取者 〇〇」。2行目とアクセシブル名で同じ文言を使う (AC-HIS-007-2)
export function describeHistoryParty(row: HistoryRow): string | undefined {
  if (row.type === "income") return `受取者 ${row.partyDisplayName}`;
  return describeHistorySpenders(row);
}

// 行リンクのアクセシブル名。日付・カテゴリ・金額を基本に、対象者の支出額・支出した人または受取者・メモを補う (AC-HIS-006-3)
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
  const party = describeHistoryParty(row);
  if (party) parts.push(party);
  if (row.memo) parts.push(row.memo);
  return parts.join(" ");
}
