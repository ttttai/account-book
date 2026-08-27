import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { resolveExpenseInitialDate } from "../domain/expense-initial-date";
import type { ExpenseFormOptions } from "./expense-types";

const groupIdSchema = z.uuid();
const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
  default_allocation: z.enum(["equal", "self"]),
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
const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  icon: z.string(),
  sort_order: z.number().int(),
});

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

export async function getExpenseFormOptions(
  unsafeGroupId: string,
  unsafeInitialDate?: unknown,
): Promise<ExpenseFormOptions | null> {
  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const [groupResult, membershipResult, categoryResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, timezone, default_allocation")
      .eq("id", groupIdResult.data)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("id, user_id, joined_at")
      .eq("group_id", groupIdResult.data)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, color, icon, sort_order")
      .eq("group_id", groupIdResult.data)
      .eq("type", "expense")
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  if (
    groupResult.error ||
    membershipResult.error ||
    categoryResult.error ||
    !groupResult.data
  ) {
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

  const memberUserIds = memberships.map((membership) => membership.user_id);
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", memberUserIds);
  if (profileError) throw new Error("支出登録情報を取得できませんでした。");

  const profileByUserId = new Map(
    z
      .array(profileRowSchema)
      .parse(profileData ?? [])
      .map((profile) => [profile.user_id, profile.display_name]),
  );

  return {
    group: {
      id: group.id,
      name: group.name,
      timezone: group.timezone,
      defaultAllocation: group.default_allocation,
      currentMembershipId: currentMembership.id,
    },
    today: resolveExpenseInitialDate(
      unsafeInitialDate,
      dateInTimeZone(new Date(), group.timezone),
    ),
    members: memberships.map((membership) => ({
      membershipId: membership.id,
      displayName: profileByUserId.get(membership.user_id) ?? "メンバー",
      isCurrentUser: membership.user_id === userId,
    })),
    categories: z
      .array(categoryRowSchema)
      .parse(categoryResult.data ?? [])
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
      })),
  };
}
