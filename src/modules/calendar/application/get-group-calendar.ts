import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";
import { toCategoryColor } from "@/modules/categories";
import {
  expandRecurringForMonth,
  listRecurringSchedules,
} from "@/modules/recurring/server";

import { createCalendarGrid, getMonthRange } from "../domain/calendar-grid";
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

const groupIdSchema = z.uuid();
const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
  week_starts_on: z.union([z.literal(0), z.literal(1)]),
});
const membershipRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  joined_at: z.string(),
});
const profileRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
});
const safeAmountSchema = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
]);
const transactionRowSchema = z.object({
  id: z.uuid(),
  transaction_date: z.string(),
  amount_minor: safeAmountSchema,
  payer_member_id: z.uuid(),
  created_at: z.string(),
  categories: z.object({
    name: z.string(),
    color: z.string(),
    icon: z.string(),
  }),
  transaction_allocations: z.array(
    z.object({
      member_id: z.uuid(),
      amount_minor: safeAmountSchema,
    }),
  ),
});
const incomeRowSchema = z.object({
  id: z.uuid(),
  transaction_date: z.string(),
  amount_minor: safeAmountSchema,
  recipient_member_id: z.uuid(),
  created_at: z.string(),
  categories: z.object({
    name: z.string(),
    color: z.string(),
    icon: z.string(),
  }),
});

// 指定タイムゾーンでの日付をYYYY-MM-DDで得る（Intlのparts分解でDateのローカル依存を避ける）
function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

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
export async function getGroupCalendar(
  unsafeGroupId: string,
  search: CalendarSearchInput,
): Promise<GroupCalendarData | null> {
  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const [groupResult, membershipResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, timezone, week_starts_on")
      .eq("id", groupIdResult.data)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("id, user_id, joined_at")
      .eq("group_id", groupIdResult.data)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
  ]);

  if (groupResult.error || membershipResult.error || !groupResult.data) {
    return null;
  }

  const group = groupRowSchema.parse(groupResult.data);
  const memberships = z
    .array(membershipRowSchema)
    .parse(membershipResult.data ?? []);
  const currentMembership = memberships.find(
    (membership) => membership.user_id === userId,
  );
  if (!currentMembership) return null;

  const today = dateInTimeZone(new Date(), group.timezone);
  const currentMonth = today.slice(0, 7);
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
  // scopeに応じて集計対象メンバーを決める（member指定時は実在するメンバーか確認）
  const targetMembership =
    selection.scope === "group"
      ? undefined
      : selection.scope === "self"
        ? currentMembership
        : memberships.find(
            (membership) => membership.id === selection.memberId,
          );
  if (selection.scope !== "group" && !targetMembership) {
    return {
      kind: "invalid",
      groupId: group.id,
      currentMonth,
      reason: "invalid_member",
    };
  }

  const memberUserIds = memberships.map((membership) => membership.user_id);
  const { start, endExclusive } = getMonthRange(selection.month);
  const [profileResult, transactionResult, incomeResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberUserIds),
    supabase
      .from("transactions")
      .select(
        "id, transaction_date, amount_minor, payer_member_id, created_at, categories!transactions_category_group_fk(name, color, icon), transaction_allocations!transaction_allocations_transaction_group_fk(member_id, amount_minor)",
      )
      .eq("group_id", group.id)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("transaction_date", start)
      .lt("transaction_date", endExclusive)
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select(
        "id, transaction_date, amount_minor, recipient_member_id, created_at, categories!transactions_category_group_fk(name, color, icon)",
      )
      .eq("group_id", group.id)
      .eq("type", "income")
      .is("deleted_at", null)
      .gte("transaction_date", start)
      .lt("transaction_date", endExclusive)
      .order("created_at", { ascending: false }),
  ]);

  if (profileResult.error || transactionResult.error || incomeResult.error) {
    throw new Error("カレンダーを取得できませんでした。");
  }

  const displayNameByUserId = new Map(
    z
      .array(profileRowSchema)
      .parse(profileResult.data ?? [])
      .map((profile) => [profile.user_id, profile.display_name]),
  );
  const members: readonly CalendarMember[] = memberships.map((membership) => ({
    membershipId: membership.id,
    displayName: displayNameByUserId.get(membership.user_id) ?? "メンバー",
    isCurrentUser: membership.id === currentMembership.id,
  }));
  const displayNameByMembershipId = new Map(
    members.map((member) => [member.membershipId, member.displayName]),
  );
  const expenses: readonly CalendarExpense[] = z
    .array(transactionRowSchema)
    .parse(transactionResult.data ?? [])
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.transaction_date,
      amountMinor: transaction.amount_minor,
      payerMemberId: transaction.payer_member_id,
      createdAt: transaction.created_at,
      category: transaction.categories,
      allocations: transaction.transaction_allocations.map((allocation) => ({
        memberId: allocation.member_id,
        amountMinor: allocation.amount_minor,
      })),
    }));

  const incomes: readonly CalendarIncome[] = z
    .array(incomeRowSchema)
    .parse(incomeResult.data ?? [])
    .map((income) => ({
      id: income.id,
      date: income.transaction_date,
      amountMinor: income.amount_minor,
      recipientMemberId: income.recipient_member_id,
      createdAt: income.created_at,
      category: income.categories,
    }));

  // 定期取引は設定から選択月へ展開し、単発取引と同じ集計規則へ渡す (REC-005、AC-REC-002-2)
  // transactionsを読まずに作るため、単発取引との二重集計は構造的に発生しない
  const occurrences = expandRecurringForMonth(
    await listRecurringSchedules(supabase, group.id),
    selection.month,
  );
  // 展開結果は登録日時を持たないため、日別sheetでは単発取引より後ろへ並べる
  const RECURRING_SORT_KEY = "0000-01-01T00:00:00.000Z";
  const recurringExpenses: readonly CalendarExpense[] = occurrences
    .filter((occurrence) => occurrence.type === "expense")
    .map((occurrence) => ({
      id: occurrence.occurrenceId,
      date: occurrence.date,
      amountMinor: occurrence.amountMinor,
      payerMemberId: occurrence.payerMemberId ?? "",
      createdAt: RECURRING_SORT_KEY,
      category: occurrence.category,
      allocations: occurrence.allocations,
      isRecurring: true,
      recurringName: occurrence.name,
    }));
  const recurringIncomes: readonly CalendarIncome[] = occurrences
    .filter((occurrence) => occurrence.type === "income")
    .map((occurrence) => ({
      id: occurrence.occurrenceId,
      date: occurrence.date,
      amountMinor: occurrence.amountMinor,
      recipientMemberId: occurrence.recipientMemberId ?? "",
      createdAt: RECURRING_SORT_KEY,
      category: occurrence.category,
      isRecurring: true,
      recurringName: occurrence.name,
    }));
  const allExpenses: readonly CalendarExpense[] = [
    ...expenses,
    ...recurringExpenses,
  ];
  const allIncomes: readonly CalendarIncome[] = [
    ...incomes,
    ...recurringIncomes,
  ];

  const targetMembershipId = targetMembership?.id;
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
      weekStartsOn: group.week_starts_on,
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
    grid: createCalendarGrid(selection.month, group.week_starts_on, today),
    dayTransactionsByDate: createDayTransactionsByDate(
      allExpenses,
      allIncomes,
      targetMembershipId,
      displayNameByMembershipId,
    ),
  };
}
