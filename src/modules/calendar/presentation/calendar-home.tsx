import Link from "next/link";

import type {
  CalendarInvalidData,
  CalendarReadyData,
} from "../application/calendar-types";
import { shiftMonth } from "../domain/calendar-grid";
import { formatJpy } from "../domain/calendar-summary";
import { CalendarDayExplorer } from "./calendar-day-explorer";

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
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

export function CalendarHome({ data }: Readonly<{ data: CalendarReadyData }>) {
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
    <CalendarDayExplorer
      key={`${data.month}:${data.scope}:${data.selectedMemberId ?? ""}`}
      data={data}
      header={
        <>
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
        </>
      }
      footer={
        data.monthlyTotal === 0 ? (
          <p className="calendar-empty-message">
            この月の支出はまだありません。
          </p>
        ) : null
      }
    />
  );
}
