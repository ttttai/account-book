import Link from "next/link";

import type {
  CalendarInvalidData,
  CalendarReadyData,
} from "../application/calendar-types";
import { shiftMonth } from "../domain/calendar-grid";
import {
  calculateMonthlyBalance,
  formatJpy,
  formatSignedJpy,
} from "../domain/calendar-summary";
import { CalendarDayExplorer } from "./calendar-day-explorer";
import { CalendarMemberPicker } from "./calendar-member-picker";

import styles from "./calendar.module.css";

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

// 月・集計対象・日付の表示条件をquery文字列にしたカレンダーURLを組み立てる
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

// 表示条件が不正なときのエラー表示と、今月表示へ戻るリンク
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

// 自分以外のアクティブメンバー数で2枠・直接リンク・選択欄を切り替える (AC-CAL-004-1)
// 3枠のときだけ固定語の幅を確保して残りを3枠目へ渡す修飾classを付ける (AC-CAL-004-3)
function ScopeNavigation({ data }: Readonly<{ data: CalendarReadyData }>) {
  const others = data.members.filter((member) => !member.isCurrentUser);
  const navClassName =
    others.length > 0
      ? `${styles["calendar-scope-nav"]} ${styles["has-member-slot"]}`
      : styles["calendar-scope-nav"];
  const currentMember = data.members.find((member) => member.isCurrentUser);
  const isSelfActive =
    data.scope === "self" ||
    (data.scope === "member" &&
      !!currentMember &&
      data.selectedMemberId === currentMember.membershipId);
  const isOtherSelected = data.scope === "member" && !isSelfActive;
  const onlyOther = others.length === 1 ? others[0] : undefined;
  const memberHref = (membershipId: string) =>
    createCalendarUrl(data.group.id, {
      month: data.month,
      scope: "member",
      memberId: membershipId,
    });

  return (
    <nav className={navClassName} aria-label="カレンダーの集計対象">
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
        className={isSelfActive ? "is-active" : undefined}
        href={createCalendarUrl(data.group.id, {
          month: data.month,
          scope: "self",
        })}
        aria-current={isSelfActive ? "page" : undefined}
      >
        自分
      </Link>
      {onlyOther ? (
        <Link
          className={isOtherSelected ? "is-active" : undefined}
          aria-current={isOtherSelected ? "page" : undefined}
          href={memberHref(onlyOther.membershipId)}
        >
          {onlyOther.displayName}
        </Link>
      ) : null}
      {others.length >= 2 ? (
        <CalendarMemberPicker
          isActive={isOtherSelected}
          summaryLabel={
            isOtherSelected
              ? (data.selectedMemberLabel ?? "メンバー")
              : "メンバー"
          }
          options={others.map((member) => ({
            membershipId: member.membershipId,
            label: member.displayName,
            href: memberHref(member.membershipId),
            isSelected:
              isOtherSelected && data.selectedMemberId === member.membershipId,
          }))}
        />
      ) : null}
    </nav>
  );
}

// 月ナビゲーション・集計対象・月間合計を組み合わせたカレンダー画面のルートコンポーネント
export function CalendarHome({ data }: Readonly<{ data: CalendarReadyData }>) {
  const previousMonth = shiftMonth(data.month, -1);
  const nextMonth = shiftMonth(data.month, 1);
  // ラベルは集計対象によらず「支出」「収入」「収支」で統一する (AC-CAL-013-3)
  const selectedTarget =
    data.scope === "group"
      ? "グループ支出"
      : `${data.selectedMemberLabel}の支出`;
  const monthlyBalance = calculateMonthlyBalance(
    data.monthlyTotal,
    data.monthlyIncomeTotal,
  );
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
          <header className={styles["calendar-month-navigation"]}>
            <Link
              href={createCalendarUrl(data.group.id, {
                month: previousMonth,
                ...sharedSelection,
              })}
              aria-label={`${formatMonth(previousMonth)}を表示`}
            >
              ‹
            </Link>
            <div className={styles["calendar-month-title"]}>
              <p className="eyebrow">月間カレンダー</p>
              <h2 id="calendar-title">{formatMonth(data.month)}</h2>
            </div>
            {/* 当月以外でだけ「今日」を出し、scope・memberは維持してdayは付けない (AC-CAL-014-1) */}
            {data.month !== data.currentMonth ? (
              <Link
                className={styles["calendar-today-link"]}
                href={createCalendarUrl(data.group.id, {
                  month: data.currentMonth,
                  ...sharedSelection,
                })}
                aria-label={`今日の月（${formatMonth(data.currentMonth)}）へ戻る`}
              >
                今日
              </Link>
            ) : (
              <span
                className={styles["calendar-today-placeholder"]}
                aria-hidden="true"
              >
                今日
              </span>
            )}
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
            className={styles["calendar-total"]}
            aria-label={`${selectedTarget}の月間合計`}
          >
            <p>{selectedTarget}</p>
            <strong>{formatJpy(data.monthlyTotal)}</strong>
            <span className={styles["calendar-total-aside"]}>
              <span className={styles["calendar-total-income"]}>
                収入 {data.monthlyIncomeTotal > 0 ? "＋" : ""}
                {formatJpy(data.monthlyIncomeTotal)}
              </span>
              <span
                className={
                  monthlyBalance < 0
                    ? `${styles["calendar-total-balance"]} ${styles["is-negative"]}`
                    : styles["calendar-total-balance"]
                }
              >
                収支 {formatSignedJpy(monthlyBalance)}
              </span>
            </span>
          </section>
        </>
      }
      footer={
        data.monthlyTotal === 0 && data.monthlyIncomeTotal === 0 ? (
          // Server ComponentからClient Componentへpropで渡す要素は、開発時のkey検証で
          // 未検証扱いになり警告が出るため、明示的にkeyを付ける
          <p
            className={styles["calendar-empty-message"]}
            key="calendar-empty-message"
          >
            この月の取引はまだありません。
          </p>
        ) : null
      }
    />
  );
}
