import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { createCalendarGrid, getMonthRange } from "../domain/calendar-grid";
import { parseCalendarSelection } from "../domain/calendar-input";
import {
  calculateCalendarSummary,
  type CalendarExpense,
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

// 日別パネル用に、対象者の負担額が0より大きい取引だけを登録の新しい順で日付別にまとめる
function createDayTransactionsByDate(
  expenses: readonly CalendarExpense[],
  targetMembershipId: string | undefined,
  displayNameByMembershipId: ReadonlyMap<string, string>,
): Readonly<Record<string, readonly CalendarDayTransaction[]>> {
  const transactionsByDate: Record<string, CalendarDayTransaction[]> = {};

  const transactions = [...expenses]
    .map((expense) => {
      const targetAmountMinor = targetMembershipId
        ? (expense.allocations.find(
            (allocation) => allocation.memberId === targetMembershipId,
          )?.amountMinor ?? 0)
        : expense.amountMinor;
      return { expense, targetAmountMinor };
    })
    .filter(({ targetAmountMinor }) => targetAmountMinor > 0)
    .sort((left, right) =>
      right.expense.createdAt.localeCompare(left.expense.createdAt),
    )
    .map(({ expense, targetAmountMinor }) => ({
      date: expense.date,
      transaction: {
        id: expense.id,
        amountMinor: expense.amountMinor,
        targetAmountMinor,
        categoryName: expense.category.name,
        categoryColor: expense.category.color,
        categoryIcon: expense.category.icon,
        payerDisplayName:
          displayNameByMembershipId.get(expense.payerMemberId) ?? "メンバー",
        allocations: expense.allocations.map((allocation) => ({
          membershipId: allocation.memberId,
          displayName:
            displayNameByMembershipId.get(allocation.memberId) ?? "メンバー",
          amountMinor: allocation.amountMinor,
        })),
      } satisfies CalendarDayTransaction,
    }));

  for (const { date, transaction } of transactions) {
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
  const [profileResult, transactionResult] = await Promise.all([
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
  ]);

  if (profileResult.error || transactionResult.error) {
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

  const targetMembershipId = targetMembership?.id;
  const summary = calculateCalendarSummary(
    expenses,
    targetMembershipId
      ? { scope: "member", memberId: targetMembershipId }
      : { scope: "group" },
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
    grid: createCalendarGrid(selection.month, group.week_starts_on, today),
    dayTransactionsByDate: createDayTransactionsByDate(
      expenses,
      targetMembershipId,
      displayNameByMembershipId,
    ),
  };
}
