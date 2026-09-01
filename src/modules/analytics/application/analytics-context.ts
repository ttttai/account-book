import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import type { AnalyticsTarget } from "../domain/analytics-summary";
import type { AnalyticsMember, AnalyticsPeriodTarget } from "./analytics-types";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

const groupIdSchema = z.uuid();
const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
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

type AnalyticsMembership = Readonly<{ membershipId: string; userId: string }>;

export type AnalyticsContext = Readonly<{
  supabase: ServerSupabaseClient;
  group: Readonly<{ id: string; name: string; timezone: string }>;
  /** アクティブなmembershipだけを参加順で保持する */
  memberships: readonly AnalyticsMembership[];
  currentMembershipId: string;
  /** グループのタイムゾーン上の当月（`YYYY-MM`） */
  currentMonth: string;
}>;

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

// 分析queryの共通認可境界。Google検証済みsessionとアクティブ所属を毎回確認する (AC-ANA-001-1)
// 所属がない、または存在しないグループは存在を明かさずnullを返す (AC-ANA-001-2)
export async function resolveAnalyticsContext(
  unsafeGroupId: string,
): Promise<AnalyticsContext | null> {
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
      .select("id, name, timezone")
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

  return {
    supabase,
    group: { id: group.id, name: group.name, timezone: group.timezone },
    memberships: memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.user_id,
    })),
    currentMembershipId: currentMembership.id,
    currentMonth: dateInTimeZone(new Date(), group.timezone).slice(0, 7),
  };
}

// 集計対象を、同じグループのアクティブmembershipだけを許可して解決する (AC-ANA-001-2)
export function resolveAnalyticsTarget(
  context: AnalyticsContext,
  target: AnalyticsPeriodTarget,
): AnalyticsTarget | null {
  if (target.scope === "group") return { scope: "group" };
  const memberId =
    target.scope === "self" ? context.currentMembershipId : target.memberId;
  const isActiveMember = context.memberships.some(
    (membership) => membership.membershipId === memberId,
  );
  if (!isActiveMember) return null;
  return { scope: "member", memberId };
}

// 集計対象の切替に使う表示名だけを解決する。DB行はDTOへ渡さない
export async function loadAnalyticsMembers(
  context: AnalyticsContext,
): Promise<readonly AnalyticsMember[]> {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("user_id, display_name")
    .in(
      "user_id",
      context.memberships.map((membership) => membership.userId),
    );
  if (error) throw new Error("分析データを取得できませんでした。");

  const displayNameByUserId = new Map(
    z
      .array(profileRowSchema)
      .parse(data ?? [])
      .map((profile) => [profile.user_id, profile.display_name]),
  );
  return context.memberships.map((membership) => ({
    membershipId: membership.membershipId,
    displayName: displayNameByUserId.get(membership.userId) ?? "メンバー",
    isCurrentUser: membership.membershipId === context.currentMembershipId,
  }));
}
