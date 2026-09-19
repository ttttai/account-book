export type TransactionSaveOperation = "create" | "update" | "delete";

export type TransactionType = "expense" | "income";

/** 保存結果の通知（トースト）に表示する見出しと説明 (TXN-019) */
export type TransactionSaveFeedback = Readonly<{
  title: string;
  description?: string;
}>;

/** 通知の説明に使う、保存済み（削除は削除前）の行の要約 */
export type TransactionSaveSnapshot = Readonly<{
  type: TransactionType;
  amountMinor: number;
  transactionDate: string;
  categoryName: string;
}>;

type BuildTransactionSaveFeedbackInput = Readonly<{
  operation: TransactionSaveOperation;
  snapshot: TransactionSaveSnapshot | null;
  /** 行を読めなかったときに見出しへ使う種別。不明なら「取引」 */
  fallbackType?: TransactionType;
  /** グループのタイムゾーンにおける今日（YYYY-MM-DD）。当年判定に使う */
  today: string;
}>;

const OPERATION_VERBS: Readonly<Record<TransactionSaveOperation, string>> = {
  create: "登録",
  update: "更新",
  delete: "削除",
};

const TYPE_LABELS: Readonly<Record<TransactionType, string>> = {
  expense: "支出",
  income: "収入",
};

const yenFormatter = new Intl.NumberFormat("ja-JP");

// 取引日をグループの当年なら「M/D」、他年なら「YYYY/M/D」で表す (AC-TXN-019-1)
export function formatTransactionSaveDate(
  transactionDate: string,
  today: string,
): string {
  const [year, month, day] = transactionDate.split("-").map(Number);
  const currentYear = Number(today.slice(0, 4));
  return year === currentYear ? `${month}/${day}` : `${year}/${month}/${day}`;
}

// 種別と操作から通知の見出し「支出を登録しました」を組み立てる (AC-TXN-019-1, AC-TXN-019-2)
export function formatTransactionSaveTitle(
  operation: TransactionSaveOperation,
  type: TransactionType | undefined,
): string {
  const label = type ? TYPE_LABELS[type] : "取引";
  return `${label}を${OPERATION_VERBS[operation]}しました`;
}

// 保存結果の通知を組み立てる。行を読めなかった場合は見出しだけを返し、メモと人に関する情報は載せない (AC-TXN-019-3, TXN-018)
export function buildTransactionSaveFeedback({
  operation,
  snapshot,
  fallbackType,
  today,
}: BuildTransactionSaveFeedbackInput): TransactionSaveFeedback {
  if (!snapshot) {
    return { title: formatTransactionSaveTitle(operation, fallbackType) };
  }
  return {
    title: formatTransactionSaveTitle(operation, snapshot.type),
    description: `${formatTransactionSaveDate(snapshot.transactionDate, today)} ${snapshot.categoryName} ￥${yenFormatter.format(snapshot.amountMinor)}`,
  };
}
