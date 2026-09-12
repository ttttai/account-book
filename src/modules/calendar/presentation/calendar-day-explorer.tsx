"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import type {
  CalendarDayTransaction,
  CalendarReadyData,
} from "../application/calendar-types";
import {
  buildCalendarDayRowAccessibleName,
  describeCalendarDayParty,
} from "../domain/calendar-day-row";
import type { Weekday } from "../domain/calendar-grid";
import { formatCalendarCellJpy, formatJpy } from "../domain/calendar-summary";

import styles from "./calendar.module.css";

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;

// 土曜・日曜の日番号だけに色分け用classを返す。曜日見出しの文字で判別できるため色は補助 (CAL-016)
function weekendClassName(weekday: Weekday): string {
  if (weekday === 6) return styles["is-saturday"] ?? "";
  if (weekday === 0) return styles["is-sunday"] ?? "";
  return "";
}

type CalendarDayExplorerData = Readonly<
  Pick<
    CalendarReadyData,
    | "month"
    | "scope"
    | "selectedMemberId"
    | "selectedMemberLabel"
    | "selectedDay"
    | "dailyTotals"
    | "incomeDailyTotals"
    | "grid"
    | "dayTransactionsByDate"
  > & {
    group: Readonly<{
      id: string;
      weekStartsOn: 0 | 1;
    }>;
  }
>;

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

// scope・memberを保ったまま、指定した月と任意の日付選択を反映したカレンダーURLを組み立てる
function createCalendarUrl(
  data: CalendarDayExplorerData,
  month: string,
  day?: string,
): string {
  const search = new URLSearchParams({
    month,
    scope: data.scope,
  });
  if (data.scope === "member" && data.selectedMemberId) {
    search.set("member", data.selectedMemberId);
  }
  if (day) search.set("day", day);
  return `/groups/${encodeURIComponent(data.group.id)}?${search.toString()}`;
}

// 現在の表示条件を保ったまま、日付選択を反映したカレンダーURLを組み立てる
function createCalendarDayUrl(
  data: CalendarDayExplorerData,
  day?: string,
): string {
  return createCalendarUrl(data, data.month, day);
}

// 修飾キーなしの左クリックだけをアプリ内遷移に置き換える（新規タブ等はブラウザに任せる）
function isPlainPrimaryClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

type JpyDigitGroup = Readonly<{
  offset: number;
  text: string;
  isLast: boolean;
}>;

// 狭い画面で3桁区切りごとに折り返せるよう、金額を桁グループへ分割する
function splitJpyDigitGroups(amountMinor: number): readonly JpyDigitGroup[] {
  const digitGroups = formatCalendarCellJpy(amountMinor).split(",");
  let offset = 0;
  return digitGroups.map((digitGroup, index) => {
    const group = {
      offset,
      text: digitGroup,
      isLast: index === digitGroups.length - 1,
    };
    offset += digitGroup.length + 1;
    return group;
  });
}

// 収入の符号を含め6桁までは1行に保ち、7桁以上だけ桁区切りで折り返せるようにする
const maxUnwrappedAmountMinor = 999999;

function CalendarCellAmount({
  amountMinor,
  variant,
}: Readonly<{ amountMinor: number; variant?: "income" }>) {
  const isUnwrapped = amountMinor <= maxUnwrappedAmountMinor;
  const className = [
    styles["calendar-cell-amount"],
    variant === "income" ? styles["calendar-cell-income"] : "",
    isUnwrapped ? styles["calendar-cell-amount-nowrap"] : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={className} aria-hidden="true">
      {variant === "income" ? "+" : null}
      {isUnwrapped
        ? formatCalendarCellJpy(amountMinor)
        : splitJpyDigitGroups(amountMinor).map((digitGroup) => (
            <Fragment key={digitGroup.offset}>
              {digitGroup.offset > 0 ? <wbr /> : null}
              {digitGroup.isLast ? digitGroup.text : `${digitGroup.text},`}
            </Fragment>
          ))}
    </span>
  );
}

// ブラウザの戻る・進む時に、URLのday paramから選択日を復元する
function selectedDayFromLocation(selectableDates: ReadonlySet<string>) {
  const unsafeDay = new URLSearchParams(window.location.search).get("day");
  return unsafeDay && selectableDates.has(unsafeDay) ? unsafeDay : undefined;
}

// 1取引を1〜2行（固定費の展開行は名称を挟んで最大3行）で表す行リンク。行全体のタップで編集へ遷移する (AC-CAL-017-1, AC-CAL-017-2)
function DayTransactionRow({
  data,
  selectedDay,
  transaction,
}: Readonly<{
  data: CalendarDayExplorerData;
  selectedDay: string;
  transaction: CalendarDayTransaction;
}>) {
  const groupPath = `/groups/${encodeURIComponent(data.group.id)}`;
  // 展開取引は実在の取引ではないため編集ではなく固定費画面へ向ける (AC-REC-002-3)
  const href = transaction.isRecurring
    ? `${groupPath}/recurring-transactions`
    : `${groupPath}/transactions/${transaction.id}/edit?from=${encodeURIComponent(createCalendarDayUrl(data, selectedDay))}`;
  // scope=self|memberの支出だけ対象者の負担額を主金額にし、取引全体を補足する (AC-CAL-017-3)
  const target =
    transaction.type === "expense" && data.scope !== "group"
      ? { label: data.selectedMemberLabel ?? "対象" }
      : undefined;
  const recurringName = transaction.isRecurring
    ? transaction.recurringName?.trim()
    : undefined;
  // 支出は支出した人、収入は受取者を出し、支出の支払者は画面へ出さない (AC-TXN-018-3)
  const details = [
    { key: "memo", text: transaction.memo?.trim(), isMemo: true },
    {
      key: "party",
      text: describeCalendarDayParty(transaction),
      isMemo: false,
    },
  ].filter((detail): detail is { key: string; text: string; isMemo: boolean } =>
    Boolean(detail.text),
  );

  return (
    <a
      className={styles["calendar-transaction-row"]}
      href={href}
      aria-label={buildCalendarDayRowAccessibleName(transaction, target)}
    >
      <span
        className={styles["category-dot"]}
        data-category-color={transaction.categoryColor}
        aria-hidden="true"
      />
      <span className={styles["calendar-transaction-main"]}>
        <span className={styles["calendar-transaction-title"]}>
          <strong>{transaction.categoryName}</strong>
          {transaction.isRecurring ? (
            <span className={styles["calendar-recurring-badge"]}>固定費</span>
          ) : null}
          {transaction.type === "income" ? (
            <span className={styles["calendar-type-income"]}>収入</span>
          ) : null}
        </span>
        {recurringName ? (
          <span className={styles["calendar-recurring-name"]}>
            {transaction.recurringName}
          </span>
        ) : null}
        {details.length > 0 ? (
          <span className={styles["calendar-transaction-details"]}>
            {details.map((detail) => (
              <span
                key={detail.key}
                className={
                  detail.isMemo
                    ? styles["calendar-transaction-memo"]
                    : undefined
                }
              >
                {detail.text}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <span className={styles["calendar-transaction-amounts"]}>
        {transaction.type === "income" ? (
          <span className={styles["calendar-income-amount"]}>
            ＋{formatJpy(transaction.amountMinor)}
          </span>
        ) : (
          <span className={styles["calendar-transaction-amount"]}>
            {formatJpy(
              target ? transaction.targetAmountMinor : transaction.amountMinor,
            )}
          </span>
        )}
        {target ? (
          <span className={styles["calendar-transaction-total"]}>
            取引全体 {formatJpy(transaction.amountMinor)}
          </span>
        ) : null}
      </span>
    </a>
  );
}

// 選択日の合計と取引一覧を表示するパネル
function DayPanel({
  data,
  selectedDay,
  onClose,
}: Readonly<{
  data: CalendarDayExplorerData;
  selectedDay: string;
  onClose: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}>) {
  const dayTotal = data.dailyTotals[selectedDay] ?? 0;
  const dayIncomeTotal = data.incomeDailyTotals[selectedDay] ?? 0;
  const dayTransactions = data.dayTransactionsByDate[selectedDay] ?? [];

  return (
    <aside
      className={styles["calendar-day-panel"]}
      aria-labelledby="selected-day-title"
    >
      <header>
        <div className={styles["calendar-day-summary"]}>
          <h2 id="selected-day-title">{formatDay(selectedDay)}</h2>
          <p className={styles["calendar-day-total"]}>{formatJpy(dayTotal)}</p>
          {dayIncomeTotal > 0 ? (
            <p className={styles["calendar-day-income-total"]}>
              収入 ＋{formatJpy(dayIncomeTotal)}
            </p>
          ) : null}
        </div>
        <a
          className={styles["calendar-close-link"]}
          href={createCalendarDayUrl(data)}
          aria-label="日別取引を閉じる"
          onClick={onClose}
        >
          閉じる
        </a>
      </header>
      {dayTransactions.length === 0 ? (
        <p className={styles["calendar-empty-message"]}>
          この対象の取引はありません。
        </p>
      ) : (
        <ul className={styles["calendar-day-transactions"]}>
          {dayTransactions.map((transaction) => (
            <li key={transaction.id}>
              <DayTransactionRow
                data={data}
                selectedDay={selectedDay}
                transaction={transaction}
              />
            </li>
          ))}
        </ul>
      )}
      <a
        className={`secondary-link ${styles["calendar-day-add"]}`}
        href={`/groups/${encodeURIComponent(data.group.id)}/transactions/new?date=${selectedDay}`}
      >
        この日付で取引を追加
      </a>
    </aside>
  );
}

// カレンダーグリッドと日別パネルを、ページ再取得なしのURL同期（pushState）で切り替えるClient Component
export function CalendarDayExplorer({
  data,
  header,
  footer,
}: Readonly<{
  data: CalendarDayExplorerData;
  header?: ReactNode;
  footer?: ReactNode;
}>) {
  const selectableDates = useMemo(
    () =>
      new Set(
        data.grid
          .filter((cell) => cell.isCurrentMonth)
          .map((cell) => cell.date),
      ),
    [data.grid],
  );
  const [selectedDay, setSelectedDay] = useState(data.selectedDay);
  const dayLinks = useRef(new Map<string, HTMLAnchorElement>());
  const weekdays =
    data.group.weekStartsOn === 0
      ? weekdayLabels
      : [...weekdayLabels.slice(1), weekdayLabels[0]];

  useEffect(() => {
    function handlePopState() {
      setSelectedDay(selectedDayFromLocation(selectableDates));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectableDates]);

  function updateSelectedDay(day: string | undefined) {
    setSelectedDay(day);
    window.history.pushState(null, "", createCalendarDayUrl(data, day));
  }

  function handleDayClick(
    event: ReactMouseEvent<HTMLAnchorElement>,
    day: string,
  ) {
    if (!isPlainPrimaryClick(event)) return;
    event.preventDefault();
    if (day !== selectedDay) updateSelectedDay(day);
  }

  function handleClose(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!isPlainPrimaryClick(event)) return;
    event.preventDefault();
    const previouslySelectedDay = selectedDay;
    updateSelectedDay(undefined);
    // パネルを閉じたら、開く前に選んでいた日付セルへfocusを戻す
    if (previouslySelectedDay) {
      dayLinks.current.get(previouslySelectedDay)?.focus();
    }
  }

  return (
    <div
      className={
        selectedDay
          ? `${styles["calendar-layout"]} ${styles["has-day-panel"]}`
          : styles["calendar-layout"]
      }
    >
      <section className="calendar-card" aria-labelledby="calendar-title">
        {header}
        {/* 月移動は前月・翌月・「今日」のリンクだけで行い、カレンダー本体に横スワイプの判定を持たせない (AC-CAL-001-19) */}
        <table
          className={styles["calendar-grid"]}
          aria-label={`${formatMonth(data.month)}の取引`}
        >
          <thead>
            <tr>
              {weekdays.map((weekday) => (
                <th
                  key={weekday}
                  className={styles["calendar-weekday"]}
                  scope="col"
                >
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, weekIndex) =>
              data.grid.slice(weekIndex * 7, weekIndex * 7 + 7),
            ).map((week) => (
              <tr key={week[0]?.date}>
                {week.map((cell) => {
                  const amount = cell.isCurrentMonth
                    ? data.dailyTotals[cell.date]
                    : undefined;
                  const incomeAmount = cell.isCurrentMonth
                    ? data.incomeDailyTotals[cell.date]
                    : undefined;
                  const isSelected = cell.date === selectedDay;
                  const className = [
                    styles["calendar-cell"],
                    cell.isCurrentMonth
                      ? styles["is-current-month"]
                      : styles["is-other-month"],
                    weekendClassName(cell.weekday),
                    cell.isToday ? styles["is-today"] : "",
                    isSelected ? styles["is-selected"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const expenseLabel = amount
                    ? `支出${formatJpy(amount)}`
                    : "支出なし";
                  const exactLabel = incomeAmount
                    ? `${formatDay(cell.date)}、${expenseLabel}、収入${formatJpy(incomeAmount)}`
                    : `${formatDay(cell.date)}、${expenseLabel}`;

                  return (
                    <td key={cell.date} className={className}>
                      {cell.isCurrentMonth ? (
                        <a
                          ref={(link) => {
                            if (link) dayLinks.current.set(cell.date, link);
                            else dayLinks.current.delete(cell.date);
                          }}
                          className={styles["calendar-cell-link"]}
                          href={createCalendarDayUrl(data, cell.date)}
                          aria-label={exactLabel}
                          aria-current={cell.isToday ? "date" : undefined}
                          onClick={(event) => handleDayClick(event, cell.date)}
                        >
                          <span className={styles["calendar-day-number"]}>
                            {cell.day}
                          </span>
                          {amount ? (
                            <CalendarCellAmount amountMinor={amount} />
                          ) : null}
                          {incomeAmount ? (
                            <CalendarCellAmount
                              amountMinor={incomeAmount}
                              variant="income"
                            />
                          ) : null}
                        </a>
                      ) : (
                        <span className={styles["calendar-cell-link"]}>
                          <span className={styles["calendar-day-number"]}>
                            {cell.day}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {footer}
      </section>
      {selectedDay ? (
        <DayPanel data={data} selectedDay={selectedDay} onClose={handleClose} />
      ) : null}
    </div>
  );
}
