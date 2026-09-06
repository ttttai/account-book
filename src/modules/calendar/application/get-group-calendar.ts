import "server-only";

import { toCategoryColor } from "@/modules/categories";
import {
  loadGroupMembers,
  resolveGroupReadContext,
} from "@/modules/groups/server";
import { listMonthlyTransactions } from "@/modules/transactions/server";

import { createCalendarGrid } from "../domain/calendar-grid";
import { parseCalendarSelection } from "../domain/calendar-input";
import {
  calculateCalendarIncomeSummary,
  calculateCalendarSummary,
  type CalendarExpense,
  type CalendarIncome,
} from "../domain/calendar-summary";
import type {
  CalendarDayTransaction,
  CalendarMember,
  CalendarSearchInput,
  GroupCalendarData,
} from "./calendar-types";

// 日別パネル用に、対象の支出（負担額が0より大きい）と収入（受取者が対象）を登録の新しい順で日付別にまとめる
function createDayTransactionsByDate(
  expenses: readonly CalendarExpense[],
  incomes: readonly CalendarIncome[],
  targetMembershipId: string | undefined,
  displayNameByMembershipId: ReadonlyMap<string, string>,
): Readonly<Record<string, readonly CalendarDayTransaction[]>> {
  const transactionsByDate: Record<string, CalendarDayTransaction[]> = {};

  const expenseEntries = [...expenses]
    .map((expense) => {
      const targetAmountMinor = targetMembershipId
        ? (expense.allocations.find(
            (allocation) => allocation.memberId === targetMembershipId,
          )?.amountMinor ?? 0)
        : expense.amountMinor;
      return { expense, targetAmountMinor };
    })
    .filter(({ targetAmountMinor }) => targetAmountMinor > 0)
    .map(({ expense, targetAmountMinor }) => ({
      date: expense.date,
      createdAt: expense.createdAt,
      transaction: {
        id: expense.id,
        memo: expense.memo ?? null,
        type: "expense",
        amountMinor: expense.amountMinor,
        targetAmountMinor,
        categoryName: expense.category.name,
        categoryColor: toCategoryColor(expense.category.color),
        categoryIcon: expense.category.icon,
        partyDisplayName:
          displayNameByMembershipId.get(expense.payerMemberId) ?? "メンバー",
        allocations: expense.allocations.map((allocation) => ({
          membershipId: allocation.memberId,
          displayName:
            displayNameByMembershipId.get(allocation.memberId) ?? "メンバー",
          amountMinor: allocation.amountMinor,
        })),
        isRecurring: expense.isRecurring === true,
        ...(expense.recurringName
          ? { recurringName: expense.recurringName }
          : {}),
      } satisfies CalendarDayTransaction,
    }));

  // 収入は対象メンバー指定時、受取者が一致するものだけを表示する (AC-CAL-012-2)
  const incomeEntries = incomes
    .filter(
      (income) =>
        !targetMembershipId || income.recipientMemberId === targetMembershipId,
    )
    .map((income) => ({
      date: income.date,
      createdAt: income.createdAt,
      transaction: {
        id: income.id,
        memo: income.memo ?? null,
        type: "income",
        amountMinor: income.amountMinor,
        targetAmountMinor: income.amountMinor,
        categoryName: income.category.name,
        categoryColor: toCategoryColor(income.category.color),
        categoryIcon: income.category.icon,
        partyDisplayName:
          displayNameByMembershipId.get(income.recipientMemberId) ?? "メンバー",
        allocations: [],
        isRecurring: income.isRecurring === true,
        ...(income.recurringName
          ? { recurringName: income.recurringName }
          : {}),
      } satisfies CalendarDayTransaction,
    }));

  const entries = [...expenseEntries, ...incomeEntries].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  for (const { date, transaction } of entries) {
    const dayTransactions = transactionsByDate[date] ?? [];
    dayTransactions.push(transaction);
    transactionsByDate[date] = dayTransactions;
  }

  return transactionsByDate;
}

// 認証・所属確認と表示条件の検証を行い、グループカレンダー画面の表示データ一式を取得する
// 認可contextと月次取引の読み取りは共有境界を使い、カレンダーは集計とDTO変換だけを担う
export async function getGroupCalendar(
  unsafeGroupId: string,
  search: CalendarSearchInput,
): Promise<GroupCalendarData | null> {
  const context = await resolveGroupReadContext(unsafeGroupId);
  if (!context) return null;

  const { group, today, currentMonth } = context;
  const selectionResult = parseCalendarSelection(search, currentMonth);
  if (!selectionResult.success) {
    return {
      kind: "invalid",
      groupId: group.id,
      currentMonth,
      reason: selectionResult.reason,
    };
  }

  const selection = selectionResult.value;
  // scopeに応じて集計対象メンバーを決める（member指定時は実在するアクティブメンバーか確認）
  const targetMembershipId =
    selection.scope === "group"
      ? undefined
      : selection.scope === "self"
        ? context.currentMembershipId
        : context.memberships.find(
            (membership) => membership.membershipId === selection.memberId,
          )?.membershipId;
  if (selection.scope !== "group" && !targetMembershipId) {
    return {
      kind: "invalid",
      groupId: group.id,
      currentMonth,
      reason: "invalid_member",
    };
  }

  // 固定費は共有読み取りの中で選択月へ展開され、単発取引と同じ集計規則へ渡る (REC-005、AC-REC-002-2)
  const [groupMembers, monthly] = await Promise.all([
    loadGroupMembers(context),
    listMonthlyTransactions(context.supabase, group.id, [selection.month]),
  ]);

  const members: readonly CalendarMember[] = groupMembers.map((member) => ({
    membershipId: member.membershipId,
    displayName: member.displayName,
    isCurrentUser: member.isCurrentUser,
  }));
  const displayNameByMembershipId = new Map(
    members.map((member) => [member.membershipId, member.displayName]),
  );
  const allExpenses: readonly CalendarExpense[] = monthly.expenses;
  const allIncomes: readonly CalendarIncome[] = monthly.incomes;

  const summaryTarget = targetMembershipId
    ? ({ scope: "member", memberId: targetMembershipId } as const)
    : ({ scope: "group" } as const);
  const summary = calculateCalendarSummary(allExpenses, summaryTarget);
  const incomeSummary = calculateCalendarIncomeSummary(
    allIncomes,
    summaryTarget,
  );

  return {
    kind: "ready",
    group: {
      id: group.id,
      name: group.name,
      timezone: group.timezone,
      weekStartsOn: group.weekStartsOn,
    },
    month: selection.month,
    currentMonth,
    today,
    scope: selection.scope,
    ...(selection.memberId ? { selectedMemberId: selection.memberId } : {}),
    ...(targetMembershipId
      ? {
          selectedMemberLabel:
            displayNameByMembershipId.get(targetMembershipId) ?? "メンバー",
        }
      : {}),
    ...(selection.day ? { selectedDay: selection.day } : {}),
    members,
    ...summary,
    ...incomeSummary,
    grid: createCalendarGrid(selection.month, group.weekStartsOn, today),
    dayTransactionsByDate: createDayTransactionsByDate(
      allExpenses,
      allIncomes,
      targetMembershipId,
      displayNameByMembershipId,
    ),
  };
}
