"use client";

import { useState } from "react";

import {
  formatHistoryDateHeading,
  groupHistoryRowsByDate,
  type HistoryDateGroup,
} from "../domain/history-date";
import { formatHistoryJpy } from "../domain/history-jpy";
import { appendHistoryRows, type HistoryRow } from "../domain/history-row";
import {
  buildHistoryRowAccessibleName,
  summarizeHistoryAllocations,
} from "../domain/history-row-label";
import { loadMoreHistoryAction } from "./actions";

import styles from "./history.module.css";

type HistoryListProps = Readonly<{
  groupId: string;
  filterParams: Readonly<Record<string, string>>;
  initialRows: readonly HistoryRow[];
  initialNextCursor?: string;
  /** グループのタイムゾーン上の今日。日付見出しで年を省くかの判定に使う (AC-HIS-006-1) */
  todayDate: string;
  /** 支出した人で絞り込んでいるときの表示名。アクセシブル名の「〇〇の支出」に使う (HIS-004) */
  targetMemberName?: string;
}>;

// 1取引を1〜2行で表す行リンク。行全体をタップすると編集へ遷移する (AC-HIS-006-2, AC-HIS-006-3)
function HistoryRowItem({
  row,
  dateHeading,
  editHref,
  targetMemberName,
}: Readonly<{
  row: HistoryRow;
  dateHeading: string;
  editHref: string;
  targetMemberName?: string;
}>) {
  const allocationSummary = summarizeHistoryAllocations(row);
  // 収入の受取者だけ表示し、支出の支払者は画面へ出さない (AC-TXN-018-3)
  const details = [
    { key: "memo", text: row.memo },
    { key: "split", text: allocationSummary },
    {
      key: "recipient",
      text:
        row.type === "income" ? `受取者 ${row.partyDisplayName}` : undefined,
    },
  ].filter((detail): detail is { key: string; text: string } =>
    Boolean(detail.text),
  );

  return (
    <li>
      <a
        className={styles["history-row"]}
        href={editHref}
        aria-label={buildHistoryRowAccessibleName(
          row,
          dateHeading,
          targetMemberName,
        )}
      >
        <span
          className={styles["history-category-dot"]}
          data-category-color={row.categoryColor}
          aria-hidden="true"
        />
        <span className={styles["history-row-main"]}>
          <span className={styles["history-row-title"]}>
            <strong>{row.categoryName}</strong>
            {row.type === "income" ? (
              <span className={styles["history-type-income"]}>収入</span>
            ) : null}
          </span>
          {details.length > 0 ? (
            <span className={styles["history-row-details"]}>
              {details.map((detail) => (
                <span key={detail.key}>{detail.text}</span>
              ))}
            </span>
          ) : null}
        </span>
        <span className={styles["history-row-amounts"]}>
          <span className={styles["history-amount"]}>
            {formatHistoryJpy(row.targetAmountMinor ?? row.amountMinor)}
          </span>
          {row.targetAmountMinor !== undefined ? (
            <span className={styles["history-row-total"]}>
              取引全体 {formatHistoryJpy(row.amountMinor)}
            </span>
          ) : null}
        </span>
      </a>
    </li>
  );
}

// 取引日ごとの見出しと、その日の行リストを描く (AC-HIS-006-1)
function HistoryDateSection({
  group,
  heading,
  buildEditHref,
  targetMemberName,
}: Readonly<{
  group: HistoryDateGroup;
  heading: string;
  buildEditHref: (transactionId: string) => string;
  targetMemberName?: string;
}>) {
  const headingId = `history-date-${group.date}`;
  return (
    <li className={styles["history-date-group"]}>
      <h2 className={styles["history-date-heading"]} id={headingId}>
        <time dateTime={group.date}>{heading}</time>
      </h2>
      <ol className={styles["history-rows"]} aria-labelledby={headingId}>
        {group.rows.map((row) => (
          <HistoryRowItem
            dateHeading={heading}
            editHref={buildEditHref(row.id)}
            key={row.id}
            row={row}
            targetMemberName={targetMemberName}
          />
        ))}
      </ol>
    </li>
  );
}

// 取得済み履歴と追加ページを保持し、日付見出しで束ねた行リンクを表示する
export function HistoryList({
  groupId,
  filterParams,
  initialRows,
  initialNextCursor,
  todayDate,
  targetMemberName,
}: HistoryListProps) {
  const [rows, setRows] = useState(initialRows);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  // 編集から戻るときに現在の絞り込みを復元できるよう、適用中条件つきの履歴URLを組み立てる
  const historySearch = new URLSearchParams(filterParams).toString();
  const historyReturnUrl = `/groups/${groupId}/history${
    historySearch ? `?${historySearch}` : ""
  }`;
  const buildEditHref = (transactionId: string): string =>
    `/groups/${encodeURIComponent(groupId)}/transactions/${transactionId}/edit?from=${encodeURIComponent(historyReturnUrl)}`;

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

  // 追記後の全行から束ね直すので、同じ日付が次ページへ続いても見出しは重複しない
  const dateGroups = groupHistoryRowsByDate(rows);

  return (
    <section className={styles["history-results"]} aria-label="取引履歴の一覧">
      {rows.length === 0 ? (
        <p className={styles["history-empty-message"]}>
          条件に一致する取引はありません。
        </p>
      ) : (
        <ol className={styles["history-date-groups"]}>
          {dateGroups.map((group) => (
            <HistoryDateSection
              buildEditHref={buildEditHref}
              group={group}
              heading={formatHistoryDateHeading(group.date, todayDate)}
              key={group.date}
              targetMemberName={targetMemberName}
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
