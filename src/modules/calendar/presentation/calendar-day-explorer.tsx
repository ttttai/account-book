"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import type { CalendarReadyData } from "../application/calendar-types";
import { formatCalendarCellJpy } from "../domain/calendar-summary";

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

function formatJpy(amountMinor: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amountMinor);
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

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

function selectedDayFromLocation(selectableDates: ReadonlySet<string>) {
  const unsafeDay = new URLSearchParams(window.location.search).get("day");
  return unsafeDay && selectableDates.has(unsafeDay) ? unsafeDay : undefined;
}

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
    <aside className="calendar-day-panel" aria-labelledby="selected-day-title">
      <header>
        <div>
          <p className="eyebrow">選択日</p>
          <h2 id="selected-day-title">{formatDay(selectedDay)}</h2>
          <p className="calendar-day-total">{formatJpy(dayTotal)}</p>
        </div>
        <a
          className="calendar-close-link"
          href={createCalendarDayUrl(data)}
          aria-label="日別取引を閉じる"
          onClick={onClose}
        >
          閉じる
        </a>
      </header>
      {dayTransactions.length === 0 ? (
        <p className="calendar-empty-message">この対象の支出はありません。</p>
      ) : (
        <ul className="calendar-day-transactions">
          {dayTransactions.map((transaction) => (
            <li key={transaction.id}>
              <div className="calendar-transaction-heading">
                <span
                  className={`category-dot category-${transaction.categoryColor}`}
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
        className="secondary-link calendar-day-add"
        href={`/groups/${encodeURIComponent(data.group.id)}/transactions/new?date=${selectedDay}`}
      >
        この日付で支出を追加
      </a>
    </aside>
  );
}

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
    if (previouslySelectedDay) {
      dayLinks.current.get(previouslySelectedDay)?.focus();
    }
  }

  return (
    <div
      className={
        selectedDay ? "calendar-layout has-day-panel" : "calendar-layout"
      }
    >
      <section className="calendar-card" aria-labelledby="calendar-title">
        {header}
        <table
          className="calendar-grid"
          aria-label={`${formatMonth(data.month)}の支出`}
        >
          <thead>
            <tr>
              {weekdays.map((weekday) => (
                <th key={weekday} className="calendar-weekday" scope="col">
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
                    "calendar-cell",
                    cell.isCurrentMonth ? "is-current-month" : "is-other-month",
                    cell.isToday ? "is-today" : "",
                    isSelected ? "is-selected" : "",
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
                          className="calendar-cell-link"
                          href={createCalendarDayUrl(data, cell.date)}
                          aria-label={exactLabel}
                          aria-current={cell.isToday ? "date" : undefined}
                          onClick={(event) => handleDayClick(event, cell.date)}
                        >
                          <span className="calendar-day-number">
                            {cell.day}
                          </span>
                          {amount ? (
                            <span
                              className="calendar-cell-amount"
                              aria-hidden="true"
                            >
                              {formatCalendarCellJpy(amount)}
                            </span>
                          ) : null}
                        </a>
                      ) : (
                        <span className="calendar-cell-link">
                          <span className="calendar-day-number">
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
