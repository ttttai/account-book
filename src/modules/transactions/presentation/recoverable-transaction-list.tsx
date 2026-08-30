import type { RecoverableTransaction } from "../application/edit-types";
import { RestoreTransactionForm } from "./restore-transaction-form";

import styles from "./transactions.module.css";

const yenFormatter = new Intl.NumberFormat("ja-JP");

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

// UTC日時文字列をAsia/Tokyo基準の「YYYY年M月D日」へ変換する
function formatDateTimeAsTokyoDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}年${values.get("month")}月${values.get("day")}日`;
}

// 削除から30日以内の取引一覧。各行の復元操作と期限を表示するServer Component
export function RecoverableTransactionList({
  groupId,
  transactions,
}: Readonly<{
  groupId: string;
  transactions: readonly RecoverableTransaction[];
}>) {
  if (transactions.length === 0) {
    return (
      <p className={styles["restore-empty-message"]}>
        復元できる削除済み取引はありません。
      </p>
    );
  }

  return (
    <ul className={styles["restore-list"]}>
      {transactions.map((transaction) => (
        <li className={styles["restore-row"]} key={transaction.id}>
          <div className={styles["restore-row-heading"]}>
            <span
              className={styles["restore-category-dot"]}
              data-category-color={transaction.categoryColor}
            />
            <strong>{transaction.categoryName}</strong>
            <span className={styles["restore-amount"]}>
              ￥{yenFormatter.format(transaction.amountMinor)}
            </span>
          </div>
          <p className={styles["restore-row-meta"]}>
            <time dateTime={transaction.transactionDate}>
              {formatDate(transaction.transactionDate)}
            </time>
            <span>支払者 {transaction.payerDisplayName}</span>
          </p>
          <p className={styles["restore-row-deadline"]}>
            {formatDateTimeAsTokyoDate(transaction.deletedAt)}に削除・
            {formatDateTimeAsTokyoDate(transaction.restoreDeadline)}
            まで復元できます
          </p>
          <RestoreTransactionForm
            expectedVersion={transaction.version}
            groupId={groupId}
            transactionId={transaction.id}
          />
        </li>
      ))}
    </ul>
  );
}
