"use client";

import { useState } from "react";

import { formatHistoryJpy } from "../domain/history-jpy";
import { appendHistoryRows, type HistoryRow } from "../domain/history-row";
import { loadMoreHistoryAction } from "./actions";

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

function HistoryRowItem({ row }: Readonly<{ row: HistoryRow }>) {
  return (
    <li className="history-row">
      <div className="history-row-heading">
        <span
          className="history-category-dot"
          data-category-color={row.categoryColor}
        />
        <strong>{row.categoryName}</strong>
        <span className={`history-type history-type-${row.type}`}>
          {row.type === "expense" ? "支出" : "収入"}
        </span>
        <span className="history-amount">
          {formatHistoryJpy(row.amountMinor)}
        </span>
      </div>
      <p className="history-row-meta">
        <time dateTime={row.transactionDate}>
          {formatHistoryDate(row.transactionDate)}
        </time>
        <span>
          {row.type === "expense" ? "支払者" : "受取者"} {row.partyDisplayName}
        </span>
      </p>
      {row.allocations.length > 0 ? (
        <p className="history-row-allocations">
          負担{" "}
          {row.allocations
            .map(
              (allocation) =>
                `${allocation.displayName} ${formatHistoryJpy(allocation.amountMinor)}`,
            )
            .join(" / ")}
        </p>
      ) : null}
      {row.memo ? <p className="history-row-memo">{row.memo}</p> : null}
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
    <section className="history-results" aria-label="取引履歴の一覧">
      {rows.length === 0 ? (
        <p className="history-empty-message">
          条件に一致する取引はありません。
        </p>
      ) : (
        <ol className="history-rows">
          {rows.map((row) => (
            <HistoryRowItem key={row.id} row={row} />
          ))}
        </ol>
      )}
      {errorMessage ? (
        <p className="history-error-message" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {nextCursor ? (
        <button
          className="secondary-button history-load-more"
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
