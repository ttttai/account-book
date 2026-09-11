"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  formatHistoryDateHeading,
  groupHistoryRowsByDate,
  type HistoryDateGroup,
} from "../domain/history-date";
import { formatHistoryJpy } from "../domain/history-jpy";
import { appendHistoryRows, type HistoryRow } from "../domain/history-row";
import {
  buildHistoryRowAccessibleName,
  describeHistoryParty,
} from "../domain/history-row-label";
import { applyHistoryFilterAction, loadMoreHistoryAction } from "./actions";

import styles from "./history.module.css";

type HistoryListProps = Readonly<{
  groupId: string;
  /** 適用中の絞り込み条件（URL形）。変わると1ページ目を取り直して一覧だけを置き換える (AC-HIS-008-1) */
  filterParams: Readonly<Record<string, string>>;
  initialRows: readonly HistoryRow[];
  initialNextCursor?: string;
  /** グループのタイムゾーン上の今日。日付見出しで年を省くかの判定に使う (AC-HIS-006-1) */
  todayDate: string;
  /** 支出した人で絞り込んでいるときの表示名。アクセシブル名の「〇〇の支出」に使う (HIS-004) */
  targetMemberName?: string;
}>;

// 条件の同一性はURL形の文字列で判定し、取得済み条件との差分だけを取り直す
function serializeFilterParams(
  params: Readonly<Record<string, string>>,
): string {
  return new URLSearchParams(params).toString();
}

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
  // 支出は支出した人、収入は受取者を出し、支出の支払者は画面へ出さない (AC-TXN-018-3, AC-HIS-007-1)
  const details = [
    { key: "memo", text: row.memo },
    { key: "party", text: describeHistoryParty(row) },
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

// 取得済み履歴と追加ページを保持し、条件変更時は一覧だけを置き換えて日付見出しで束ねた行リンクを表示する
export function HistoryList({
  groupId,
  filterParams,
  initialRows,
  initialNextCursor,
  todayDate,
  targetMemberName,
}: HistoryListProps) {
  const requestedKey = serializeFilterParams(filterParams);
  const [rows, setRows] = useState(initialRows);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hasApplyError, setHasApplyError] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  // 連続して条件を変えたときに、古い要求の結果で新しい結果を上書きしないための通番
  const applyRequestSeq = useRef(0);
  // 直前に要求した条件。条件が変わった描画だけで取り直し、初期表示と同じ条件では取得しない
  const lastRequestedKey = useRef(requestedKey);

  const applyFilter = useCallback(
    async (params: Readonly<Record<string, string>>) => {
      applyRequestSeq.current += 1;
      const seq = applyRequestSeq.current;
      setIsApplying(true);
      setErrorMessage(undefined);
      setHasApplyError(false);
      const result = await applyHistoryFilterAction(groupId, params);
      if (seq !== applyRequestSeq.current) return;
      if (result.status === "ready") {
        setRows(result.rows);
        setNextCursor(result.nextCursor);
      } else {
        setErrorMessage(result.message);
        setHasApplyError(true);
      }
      setIsApplying(false);
    },
    [groupId],
  );

  // 条件が変わるたびに1ページ目を取り直す。結果の採用は通番で最後の要求だけに限る (AC-HIS-008-1)
  useEffect(() => {
    if (lastRequestedKey.current === requestedKey) return;
    lastRequestedKey.current = requestedKey;
    void applyFilter(filterParams);
  }, [applyFilter, filterParams, requestedKey]);

  // 編集から戻るときに現在の絞り込みを復元できるよう、適用中条件つきの履歴URLを組み立てる
  const historyReturnUrl = `/groups/${groupId}/history${
    requestedKey ? `?${requestedKey}` : ""
  }`;
  const buildEditHref = (transactionId: string): string =>
    `/groups/${encodeURIComponent(groupId)}/transactions/${transactionId}/edit?from=${encodeURIComponent(historyReturnUrl)}`;

  async function handleLoadMore() {
    if (!nextCursor || isLoadingMore || isApplying) return;
    const cursor = nextCursor;
    setIsLoadingMore(true);
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
    setIsLoadingMore(false);
  }

  // 追記後の全行から束ね直すので、同じ日付が次ページへ続いても見出しは重複しない
  const dateGroups = groupHistoryRowsByDate(rows);
  const dateGroupsClassName = isApplying
    ? `${styles["history-date-groups"]} is-stale`
    : styles["history-date-groups"];

  return (
    <section
      className={styles["history-results"]}
      aria-label="取引履歴の一覧"
      aria-busy={isApplying ? "true" : undefined}
    >
      {isApplying ? (
        <p className={styles["history-status-message"]} role="status">
          絞り込みを反映中…
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p
          className={
            isApplying
              ? `${styles["history-empty-message"]} is-stale`
              : styles["history-empty-message"]
          }
        >
          条件に一致する取引はありません。
        </p>
      ) : (
        <ol className={dateGroupsClassName}>
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
        <div className={styles["history-error"]}>
          <p className={styles["history-error-message"]} role="alert">
            {errorMessage}
          </p>
          {hasApplyError ? (
            <button
              className={`secondary-button ${styles["history-retry"]}`}
              type="button"
              onClick={() => void applyFilter(filterParams)}
            >
              再試行
            </button>
          ) : null}
        </div>
      ) : null}
      {nextCursor ? (
        <button
          className={`secondary-button ${styles["history-load-more"]}`}
          type="button"
          disabled={isLoadingMore || isApplying}
          onClick={handleLoadMore}
        >
          {isLoadingMore ? "読み込み中…" : "さらに読み込む"}
        </button>
      ) : null}
    </section>
  );
}
