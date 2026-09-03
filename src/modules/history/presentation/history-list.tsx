"use client";

import { useState } from "react";

import { formatHistoryJpy } from "../domain/history-jpy";
import {
  appendHistoryRows,
  areHistoryRowsEqual,
  type HistoryRow,
} from "../domain/history-row";
import { loadMoreHistoryAction } from "./actions";

import styles from "./history.module.css";

type HistoryListProps = Readonly<{
  groupId: string;
  filterParams: Readonly<Record<string, string>>;
  initialRows: readonly HistoryRow[];
  initialNextCursor?: string;
}>;

function formatHistoryDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function HistoryRowItem({
  row,
  editHref,
}: Readonly<{ row: HistoryRow; editHref?: string }>) {
  return (
    <li className={styles["history-row"]}>
      <div className={styles["history-row-heading"]}>
        <span
          className={styles["history-category-dot"]}
          data-category-color={row.categoryColor}
        />
        <strong>{row.categoryName}</strong>
        <span
          className={`${styles["history-type"]} ${
            styles[`history-type-${row.type}`] ?? ""
          }`}
        >
          {row.type === "expense" ? "支出" : "収入"}
        </span>
        <span className={styles["history-amount"]}>
          {formatHistoryJpy(row.amountMinor)}
        </span>
      </div>
      <p className={styles["history-row-meta"]}>
        <time dateTime={row.transactionDate}>
          {formatHistoryDate(row.transactionDate)}
        </time>
        <span>
          {row.type === "expense" ? "支払者" : "受取者"} {row.partyDisplayName}
        </span>
      </p>
      {row.allocations.length > 0 ? (
        <p className={styles["history-row-allocations"]}>
          負担{" "}
          {row.allocations
            .map(
              (allocation) =>
                `${allocation.displayName} ${formatHistoryJpy(allocation.amountMinor)}`,
            )
            .join(" / ")}
        </p>
      ) : null}
      {row.memo ? (
        <p className={styles["history-row-memo"]}>{row.memo}</p>
      ) : null}
      {editHref ? (
        <a
          className={`secondary-link ${styles["history-row-edit"]}`}
          href={editHref}
        >
          編集
        </a>
      ) : null}
    </li>
  );
}

export function HistoryList({
  groupId,
  filterParams,
  initialRows,
  initialNextCursor,
}: HistoryListProps) {
  const [rows, setRows] = useState(initialRows);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [syncedInitialRows, setSyncedInitialRows] = useState(initialRows);

  // 他メンバーの変更による再取得で先頭ページが変わったときだけ、表示中の行を最新の先頭ページへ置き換える (AC-SYNC-004-2)
  if (!areHistoryRowsEqual(syncedInitialRows, initialRows)) {
    setSyncedInitialRows(initialRows);
    setRows(initialRows);
    setNextCursor(initialNextCursor);
    setErrorMessage(undefined);
  }

  // 編集から戻るときに現在の絞り込みを復元できるよう、適用中条件つきの履歴URLを組み立てる
  const historySearch = new URLSearchParams(filterParams).toString();
  const historyReturnUrl = `/groups/${groupId}/history${
    historySearch ? `?${historySearch}` : ""
  }`;

  async function handleLoadMore() {
    if (!nextCursor || isLoading) return;
    const cursor = nextCursor;
    setIsLoading(true);
    setErrorMessage(undefined);
    const result = await loadMoreHistoryAction(groupId, {
      ...filterParams,
      cursor,
    });
    if (result.status === "ready") {
      // 表示済みの行を維持したまま、重複を除いて続きを追記する
      setRows((currentRows) => appendHistoryRows(currentRows, result.rows));
      setNextCursor(result.nextCursor);
      const search = new URLSearchParams({ ...filterParams, cursor });
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${search.toString()}`,
      );
    } else {
      setErrorMessage(result.message);
    }
    setIsLoading(false);
  }

  return (
    <section className={styles["history-results"]} aria-label="取引履歴の一覧">
      {rows.length === 0 ? (
        <p className={styles["history-empty-message"]}>
          条件に一致する取引はありません。
        </p>
      ) : (
        <ol className={styles["history-rows"]}>
          {rows.map((row) => (
            <HistoryRowItem
              editHref={`/groups/${encodeURIComponent(groupId)}/transactions/${row.id}/edit?from=${encodeURIComponent(historyReturnUrl)}`}
              key={row.id}
              row={row}
            />
          ))}
        </ol>
      )}
      {errorMessage ? (
        <p className={styles["history-error-message"]} role="alert">
          {errorMessage}
        </p>
      ) : null}
      {nextCursor ? (
        <button
          className={`secondary-button ${styles["history-load-more"]}`}
          type="button"
          disabled={isLoading}
          onClick={handleLoadMore}
        >
          {isLoading ? "読み込み中…" : "さらに読み込む"}
        </button>
      ) : null}
    </section>
  );
}
