import { formatJpy } from "./calendar-summary";

/** 日別取引sheetの1行を組み立てるのに必要な最小の取引情報。applicationのDTOを構造的に受け取る */
export type CalendarDayRow = Readonly<{
  type: "expense" | "income";
  amountMinor: number;
  targetAmountMinor: number;
  memo?: string | null;
  categoryName: string;
  /** 支出は支払者、収入は受取者の表示名 */
  partyDisplayName: string;
  allocations: readonly Readonly<{ displayName: string }>[];
  isRecurring: boolean;
  recurringName?: string;
}>;

/** scope=self|memberで支出行の主金額にする対象メンバー */
export type CalendarDayRowTarget = Readonly<{
  label: string;
}>;

// 空白だけの文字列を未記入として扱う
function trimmedText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// 支出した人（負担メンバー）の表示名だけを「・」で連結する。見出し語・各人の金額は出さず、収入には返さない (AC-CAL-017-1)
export function describeCalendarDaySpenders(
  row: CalendarDayRow,
): string | undefined {
  if (row.type !== "expense" || row.allocations.length === 0) return undefined;
  return row.allocations.map((allocation) => allocation.displayName).join("・");
}

// 支出なら支出した人の表示名、収入なら「受取者 〇〇」。2行目とアクセシブル名で同じ文言を使う (AC-CAL-017-1)
export function describeCalendarDayParty(
  row: CalendarDayRow,
): string | undefined {
  if (row.type === "income") return `受取者 ${row.partyDisplayName}`;
  return describeCalendarDaySpenders(row);
}

// 行リンクのアクセシブル名。カテゴリ・金額を基本に、固定費の名称、対象者の支出額、表示名または受取者、メモ全文を補う (AC-CAL-017-2)
export function buildCalendarDayRowAccessibleName(
  row: CalendarDayRow,
  target?: CalendarDayRowTarget,
): string {
  const parts = [row.categoryName];
  if (row.isRecurring) {
    parts.push("固定費");
    const recurringName = trimmedText(row.recurringName);
    if (recurringName) parts.push(recurringName);
  }
  if (row.type === "income") {
    parts.push("収入", formatJpy(row.amountMinor));
  } else if (target) {
    parts.push(
      `${target.label}の支出`,
      formatJpy(row.targetAmountMinor),
      "取引全体",
      formatJpy(row.amountMinor),
    );
  } else {
    parts.push(formatJpy(row.amountMinor));
  }
  const party = describeCalendarDayParty(row);
  if (party) parts.push(party);
  const memo = trimmedText(row.memo);
  if (memo) parts.push(memo);
  return parts.join(" ");
}
