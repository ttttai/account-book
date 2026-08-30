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

import type { CalendarReadyData } from "../application/calendar-types";
import { formatCalendarCellJpy, formatJpy } from "../domain/calendar-summary";

import styles from "./calendar.module.css";

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;

type CalendarDayExplorerData = Readonly<
  Pick<
    CalendarReadyData,
    | "month"
    | "scope"
    | "selectedMemberId"
    | "selectedDay"
    | "dailyTotals"
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

// 現在の表示条件を保ったまま、日付選択を反映したカレンダーURLを組み立てる
function createCalendarDayUrl(
  data: CalendarDayExplorerData,
  day?: string,
): string {
  const search = new URLSearchParams({
    month: data.month,
    scope: data.scope,
  });
  if (data.scope === "member" && data.selectedMemberId) {
    search.set("member", data.selectedMemberId);
  }
  if (day) search.set("day", day);
  return `/groups/${encodeURIComponent(data.group.id)}?${search.toString()}`;
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

// 5桁以下（99,999円以下）は320pxでも1行で収まるため折り返し機会を与えない
const maxUnwrappedAmountMinor = 99999;

function CalendarCellAmount({
  amountMinor,
}: Readonly<{ amountMinor: number }>) {
  return (
    <span className={styles["calendar-cell-amount"]} aria-hidden="true">
      {amountMinor <= maxUnwrappedAmountMinor
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
  const dayTransactions = data.dayTransactionsByDate[selectedDay] ?? [];

  return (
    <aside
      className={styles["calendar-day-panel"]}
      aria-labelledby="selected-day-title"
    >
      <header>
        <div>
          <p className="eyebrow">選択日</p>
          <h2 id="selected-day-title">{formatDay(selectedDay)}</h2>
          <p className={styles["calendar-day-total"]}>{formatJpy(dayTotal)}</p>
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
          この対象の支出はありません。
        </p>
      ) : (
        <ul className={styles["calendar-day-transactions"]}>
          {dayTransactions.map((transaction) => (
            <li key={transaction.id}>
              <div className={styles["calendar-transaction-heading"]}>
                <span
                  className={`${styles["category-dot"]} category-${transaction.categoryColor}`}
                />
                <strong>{transaction.categoryName}</strong>
                <span>{formatJpy(transaction.amountMinor)}</span>
              </div>
              {data.scope !== "group" ? (
                <p>利用額 {formatJpy(transaction.targetAmountMinor)}</p>
              ) : null}
              <p>支払者 {transaction.payerDisplayName}</p>
              <p>
                負担{" "}
                {transaction.allocations
                  .map(
                    (allocation) =>
                      `${allocation.displayName} ${formatJpy(allocation.amountMinor)}`,
                  )
                  .join(" / ")}
              </p>
            </li>
          ))}
        </ul>
      )}
      <a
        className={`secondary-link ${styles["calendar-day-add"]}`}
        href={`/groups/${encodeURIComponent(data.group.id)}/transactions/new?date=${selectedDay}`}
      >
        この日付で支出を追加
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
        <table
          className={styles["calendar-grid"]}
          aria-label={`${formatMonth(data.month)}の支出`}
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
                  const isSelected = cell.date === selectedDay;
                  const className = [
                    styles["calendar-cell"],
                    cell.isCurrentMonth
                      ? styles["is-current-month"]
                      : styles["is-other-month"],
                    cell.isToday ? styles["is-today"] : "",
                    isSelected ? styles["is-selected"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const exactLabel = amount
                    ? `${formatDay(cell.date)}、${formatJpy(amount)}`
                    : `${formatDay(cell.date)}、支出なし`;

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
