export const TRANSACTION_CSV_HEADER = [
  "取引日",
  "種別",
  "金額",
  "カテゴリ",
  "支払者または受取者",
  "負担内訳",
  "メモ",
] as const;

export type ExportAllocation = Readonly<{
  displayName: string;
  amountMinor: number;
}>;

export type ExportTransaction = Readonly<{
  transactionDate: string;
  type: "expense" | "income";
  amountMinor: number;
  categoryName: string;
  partyDisplayName: string;
  allocations: readonly ExportAllocation[];
  memo: string | null;
}>;

const TYPE_LABELS: Readonly<Record<ExportTransaction["type"], string>> = {
  expense: "支出",
  income: "収入",
};

function formatAllocations(allocations: readonly ExportAllocation[]): string {
  return allocations
    .map((allocation) => `${allocation.displayName}:${allocation.amountMinor}`)
    .join("; ");
}

export function buildTransactionCsvRows(
  transactions: readonly ExportTransaction[],
): string[][] {
  return transactions.map((transaction) => [
    transaction.transactionDate,
    TYPE_LABELS[transaction.type],
    String(transaction.amountMinor),
    transaction.categoryName,
    transaction.partyDisplayName,
    formatAllocations(transaction.allocations),
    transaction.memo ?? "",
  ]);
}
