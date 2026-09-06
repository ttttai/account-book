import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { isEndedAsOfMonth } from "../domain/recurring-schedule";
import { firstDayToMonth } from "../domain/recurring-input";
import {
  RECURRING_SELECT_COLUMNS,
  recurringRowSchema,
  toRecurringSchedule,
  type RecurringRow,
} from "./recurring-row";
import type {
  RecurringAllocationDetail,
  RecurringManagementView,
  RecurringSummary,
} from "./recurring-types";

const groupIdSchema = z.uuid();
const groupRowSchema = z.object({ id: z.uuid(), name: z.string() });
const membershipRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  role: z.enum(["owner", "admin", "member"]),
  joined_at: z.string(),
});
const profileRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
});
const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(["expense", "income"]),
  color: z.string(),
  sort_order: z.number().int(),
});

// 指定タイムゾーンでの当月を`YYYY-MM`で得る
function currentMonthInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}`;
}

// 固定費画面の表示データを取得する。アクティブメンバーだけが閲覧でき、更新可否はroleで決まる
export async function getRecurringManagement(
  unsafeGroupId: string,
): Promise<RecurringManagementView | null> {
  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const groupId = groupIdResult.data;
  const [groupResult, membershipResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, timezone")
      .eq("id", groupId)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("id, user_id, role, joined_at")
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
  ]);
  if (groupResult.error || membershipResult.error || !groupResult.data) {
    return null;
  }

  const group = groupRowSchema
    .extend({ timezone: z.string() })
    .parse(groupResult.data);
  const memberships = z
    .array(membershipRowSchema)
    .parse(membershipResult.data ?? []);
  const currentMembership = memberships.find(
    (membership) => membership.user_id === userId,
  );
  if (!currentMembership) return null;

  const [profileResult, categoryResult, recurringResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .in(
        "user_id",
        memberships.map((membership) => membership.user_id),
      ),
    supabase
      .from("categories")
      .select("id, name, type, color, sort_order")
      .eq("group_id", groupId)
      .is("archived_at", null)
      .order("type", { ascending: true })
      .order("sort_order", { ascending: true }),
    // 取得列は行検証schemaと対になる共通定義を使う（画面ごとの書き分けで列が欠けるのを防ぐ）
    supabase
      .from("recurring_transactions")
      .select(RECURRING_SELECT_COLUMNS)
      .eq("group_id", groupId)
      .order("start_month", { ascending: true })
      .order("day_of_month", { ascending: true }),
  ]);
  if (profileResult.error || categoryResult.error || recurringResult.error) {
    throw new Error("固定費を取得できませんでした。");
  }

  const displayNameByUserId = new Map(
    z
      .array(profileRowSchema)
      .parse(profileResult.data ?? [])
      .map((profile) => [profile.user_id, profile.display_name]),
  );
  const members = memberships.map((membership) => ({
    membershipId: membership.id,
    displayName: displayNameByUserId.get(membership.user_id) ?? "メンバー",
    isCurrentUser: membership.id === currentMembership.id,
  }));
  const displayNameByMembershipId = new Map(
    members.map((member) => [member.membershipId, member.displayName]),
  );
  const categories = z
    .array(categoryRowSchema)
    .parse(categoryResult.data ?? [])
    .map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
    }));

  const currentMonth = currentMonthInTimeZone(group.timezone);
  const rows: readonly RecurringRow[] = z
    .array(recurringRowSchema)
    .parse(recurringResult.data ?? []);

  const recurringTransactions: readonly RecurringSummary[] = rows
    .map((row) => {
      const schedule = toRecurringSchedule(row);
      const allocations: readonly RecurringAllocationDetail[] =
        schedule.allocations.map((allocation) => ({
          membershipId: allocation.memberId,
          displayName:
            displayNameByMembershipId.get(allocation.memberId) ?? "メンバー",
          amountMinor: allocation.amountMinor,
        }));
      const partyMembershipId =
        schedule.payerMemberId ?? schedule.recipientMemberId ?? "";
      return {
        id: schedule.id,
        type: schedule.type,
        name: schedule.name,
        amountMinor: schedule.amountMinor,
        dayOfMonth: schedule.dayOfMonth,
        startMonth: schedule.startMonth,
        endMonth: schedule.endMonth,
        version: row.version,
        categoryName: schedule.category.name,
        categoryColor: schedule.category.color,
        partyDisplayName:
          displayNameByMembershipId.get(partyMembershipId) ?? "メンバー",
        partyMembershipId,
        memo: row.memo,
        allocations,
        isEnded: isEndedAsOfMonth(schedule, currentMonth),
      } satisfies RecurringSummary;
    })
    // 継続中を先に、終了済みを末尾へ置く（画面仕様）
    .sort((left, right) => Number(left.isEnded) - Number(right.isEnded));

  return {
    group: { id: group.id, name: group.name },
    currentMonth,
    canManage: ["owner", "admin"].includes(currentMembership.role),
    members,
    categories,
    recurringTransactions,
  };
}

export { firstDayToMonth };
