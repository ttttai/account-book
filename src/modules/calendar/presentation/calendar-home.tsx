import Link from "next/link";

import type {
  CalendarInvalidData,
  CalendarReadyData,
} from "../application/calendar-types";
import { shiftMonth } from "../domain/calendar-grid";
import { formatCompactJpy } from "../domain/calendar-summary";

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;

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

function createCalendarUrl(
  groupId: string,
  input: Readonly<{
    month: string;
    scope: CalendarReadyData["scope"];
    memberId?: string;
    day?: string;
  }>,
): string {
  const search = new URLSearchParams({
    month: input.month,
    scope: input.scope,
  });
  if (input.scope === "member" && input.memberId)
    search.set("member", input.memberId);
  if (input.day) search.set("day", input.day);
  return `/groups/${encodeURIComponent(groupId)}?${search.toString()}`;
}

export function CalendarValidationError({
  data,
}: Readonly<{ data: CalendarInvalidData }>) {
  return (
    <section className="calendar-validation-error" role="alert">
      <p className="eyebrow">表示条件を確認してください</p>
      <h2>カレンダーを表示できません</h2>
      <p>
        月、集計対象、メンバーまたは日付の指定が正しくありません。取引データは読み込んでいません。
      </p>
      <Link
        className="primary-link"
        href={`/groups/${encodeURIComponent(data.groupId)}?month=${data.currentMonth}&scope=group`}
      >
        今月のグループ表示へ戻る
      </Link>
    </section>
  );
}

function ScopeNavigation({ data }: Readonly<{ data: CalendarReadyData }>) {
  return (
    <nav className="calendar-scope-nav" aria-label="カレンダーの集計対象">
      <Link
        className={data.scope === "group" ? "is-active" : undefined}
        href={createCalendarUrl(data.group.id, {
          month: data.month,
          scope: "group",
        })}
        aria-current={data.scope === "group" ? "page" : undefined}
      >
        グループ
      </Link>
      <Link
        className={data.scope === "self" ? "is-active" : undefined}
        href={createCalendarUrl(data.group.id, {
          month: data.month,
          scope: "self",
        })}
        aria-current={data.scope === "self" ? "page" : undefined}
      >
        自分
      </Link>
      <details
        className="calendar-member-picker"
        open={data.scope === "member"}
      >
        <summary className={data.scope === "member" ? "is-active" : undefined}>
          {data.scope === "member" ? data.selectedMemberLabel : "メンバー"}
        </summary>
        <div className="calendar-member-options">
          {data.members.map((member) => (
            <Link
              key={member.membershipId}
              className={
                data.selectedMemberId === member.membershipId
                  ? "is-selected"
                  : undefined
              }
              href={createCalendarUrl(data.group.id, {
                month: data.month,
                scope: "member",
                memberId: member.membershipId,
              })}
              aria-current={
                data.selectedMemberId === member.membershipId
                  ? "page"
                  : undefined
              }
            >
              {member.displayName}
              {member.isCurrentUser ? "（自分）" : ""}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}

function DayPanel({ data }: Readonly<{ data: CalendarReadyData }>) {
  if (!data.selectedDay) return null;
  const closeUrl = createCalendarUrl(data.group.id, {
    month: data.month,
    scope: data.scope,
    ...(data.selectedMemberId ? { memberId: data.selectedMemberId } : {}),
  });
  const dayTotal = data.dailyTotals[data.selectedDay] ?? 0;

  return (
    <aside className="calendar-day-panel" aria-labelledby="selected-day-title">
      <header>
        <div>
          <p className="eyebrow">選択日</p>
          <h2 id="selected-day-title">{formatDay(data.selectedDay)}</h2>
          <p className="calendar-day-total">{formatJpy(dayTotal)}</p>
        </div>
        <Link
          className="calendar-close-link"
          href={closeUrl}
          aria-label="日別取引を閉じる"
        >
          閉じる
        </Link>
      </header>
      {data.dayTransactions.length === 0 ? (
        <p className="calendar-empty-message">この対象の支出はありません。</p>
      ) : (
        <ul className="calendar-day-transactions">
          {data.dayTransactions.map((transaction) => (
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
      <Link
        className="secondary-link calendar-day-add"
        href={`/groups/${encodeURIComponent(data.group.id)}/transactions/new?date=${data.selectedDay}`}
      >
        この日付で支出を追加
      </Link>
    </aside>
  );
}

export function CalendarHome({ data }: Readonly<{ data: CalendarReadyData }>) {
  const weekdays =
    data.group.weekStartsOn === 0
      ? weekdayLabels
      : [...weekdayLabels.slice(1), weekdayLabels[0]];
  const previousMonth = shiftMonth(data.month, -1);
  const nextMonth = shiftMonth(data.month, 1);
  const selectedTarget =
    data.scope === "group"
      ? "グループ支出"
      : `${data.selectedMemberLabel}の利用額`;
  const sharedSelection = {
    scope: data.scope,
    ...(data.selectedMemberId ? { memberId: data.selectedMemberId } : {}),
  };

  return (
    <div
      className={
        data.selectedDay ? "calendar-layout has-day-panel" : "calendar-layout"
      }
    >
      <section className="calendar-card" aria-labelledby="calendar-title">
        <header className="calendar-month-navigation">
          <Link
            href={createCalendarUrl(data.group.id, {
              month: previousMonth,
              ...sharedSelection,
            })}
            aria-label={`${formatMonth(previousMonth)}を表示`}
          >
            ‹
          </Link>
          <div>
            <p className="eyebrow">月間カレンダー</p>
            <h2 id="calendar-title">{formatMonth(data.month)}</h2>
          </div>
          <Link
            href={createCalendarUrl(data.group.id, {
              month: nextMonth,
              ...sharedSelection,
            })}
            aria-label={`${formatMonth(nextMonth)}を表示`}
          >
            ›
          </Link>
        </header>

        <ScopeNavigation data={data} />

        <section
          className="calendar-total"
          aria-label={`${selectedTarget}の月間合計`}
        >
          <p>{selectedTarget}</p>
          <strong>{formatJpy(data.monthlyTotal)}</strong>
          {data.monthlyPaidTotal !== undefined ? (
            <span>支払額 {formatJpy(data.monthlyPaidTotal)}</span>
          ) : null}
        </section>

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
                  const isSelected = cell.date === data.selectedDay;
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
                        <Link
                          className="calendar-cell-link"
                          href={createCalendarUrl(data.group.id, {
                            month: data.month,
                            ...sharedSelection,
                            day: cell.date,
                          })}
                          aria-label={exactLabel}
                          aria-current={cell.isToday ? "date" : undefined}
                        >
                          <span className="calendar-day-number">
                            {cell.day}
                          </span>
                          {amount ? (
                            <span
                              className="calendar-cell-amount"
                              aria-hidden="true"
                            >
                              {formatCompactJpy(amount)}
                            </span>
                          ) : null}
                        </Link>
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
        {data.monthlyTotal === 0 ? (
          <p className="calendar-empty-message">
            この月の支出はまだありません。
          </p>
        ) : null}
      </section>
      <DayPanel data={data} />
    </div>
  );
}
