import "server-only";

import { z } from "zod";

import {
  BackendUnavailableError,
  createQueryFailureError,
  createServerSupabaseClient,
  getAllowedGoogleUserId,
  isAuthenticationQueryError,
  isUnavailableAuthError,
} from "@/modules/auth/server";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

export type GroupMembershipStatus = "active" | "removed";

export type GroupReadMembership = Readonly<{
  membershipId: string;
  userId: string;
  status: GroupMembershipStatus;
  isCurrentUser: boolean;
}>;

/** グループ所有データを読むqueryが共有する認可済みcontext。DTOとしてClientへ渡さない */
export type GroupReadContext = Readonly<{
  supabase: ServerSupabaseClient;
  group: Readonly<{
    id: string;
    name: string;
    timezone: string;
    weekStartsOn: 0 | 1;
  }>;
  /** 参加順のmembership。標準はアクティブだけ、`includeRemovedMembers`時は削除済みも含む */
  memberships: readonly GroupReadMembership[];
  currentMembershipId: string;
  /** グループのタイムゾーン上の今日（`YYYY-MM-DD`） */
  today: string;
  /** グループのタイムゾーン上の当月（`YYYY-MM`） */
  currentMonth: string;
}>;

export type GroupReadMember = Readonly<{
  membershipId: string;
  displayName: string;
  status: GroupMembershipStatus;
  isCurrentUser: boolean;
}>;

export type GroupReadContextOptions = Readonly<{
  /** 履歴など過去参照が必要な場合だけ、削除済みmembershipを含める */
  includeRemovedMembers?: boolean;
}>;

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
  status: z.union([z.literal("active"), z.literal("removed")]),
});
const profileRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
});

// プロフィールを読めない場合の表示名。削除済みメンバーのプロフィールはRLSで取得できないため過去参照用の名前で補う
const FALLBACK_DISPLAY_NAME = "メンバー";
const REMOVED_DISPLAY_NAME = "退会メンバー";

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

// グループ読み取りqueryの共通認可境界。groupIdを検証し、Google検証済みsessionと操作者のアクティブ所属を毎回確認する
// 不正ID・未認証・非メンバー・存在しないグループは、存在を明かさずnullを返す
export async function resolveGroupReadContext(
  unsafeGroupId: string,
  options: GroupReadContextOptions = {},
): Promise<GroupReadContext | null> {
  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  // Auth APIの応答不能は未認証へ縮退させず、routeのerror境界へ委ねる (AC-AUTH-004-4)
  if (isUnavailableAuthError(claimsError)) {
    throw new BackendUnavailableError("groups.readContext.getClaims");
  }
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const groupQuery = supabase
    .from("groups")
    .select("id, name, timezone, week_starts_on")
    .eq("id", groupIdResult.data)
    .maybeSingle();
  let membershipQuery = supabase
    .from("group_members")
    .select("id, user_id, status")
    .eq("group_id", groupIdResult.data);
  if (!options.includeRemovedMembers) {
    membershipQuery = membershipQuery.eq("status", "active");
  }

  const [groupResult, membershipResult] = await Promise.all([
    groupQuery,
    membershipQuery.order("joined_at", { ascending: true }),
  ]);
  const failedResult = groupResult.error
    ? groupResult
    : membershipResult.error
      ? membershipResult
      : null;
  if (failedResult) {
    // 失効session等の認証起因の失敗だけを、存在を明かさないnullへ縮退させる (AC-AUTH-001-9)
    if (isAuthenticationQueryError(failedResult.error)) return null;
    throw createQueryFailureError(
      "groups.readContext",
      failedResult,
      "グループを取得できませんでした。",
    );
  }
  if (!groupResult.data) return null;

  const group = groupRowSchema.parse(groupResult.data);
  const memberships = z
    .array(membershipRowSchema)
    .parse(membershipResult.data ?? []);
  // 操作者自身は、削除済みmembershipを含める場合でも常にアクティブ所属を要求する
  const currentMembership = memberships.find(
    (membership) =>
      membership.user_id === userId && membership.status === "active",
  );
  if (!currentMembership) return null;

  const today = dateInTimeZone(new Date(), group.timezone);
  return {
    supabase,
    group: {
      id: group.id,
      name: group.name,
      timezone: group.timezone,
      weekStartsOn: group.week_starts_on,
    },
    memberships: memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.user_id,
      status: membership.status,
      isCurrentUser: membership.id === currentMembership.id,
    })),
    currentMembershipId: currentMembership.id,
    today,
    currentMonth: today.slice(0, 7),
  };
}

// context内のmembershipへ表示名を解決する。プロフィール欠損はアクティブなら「メンバー」、削除済みなら「退会メンバー」で補う
export async function loadGroupMembers(
  context: GroupReadContext,
): Promise<readonly GroupReadMember[]> {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("user_id, display_name")
    .in(
      "user_id",
      context.memberships.map((membership) => membership.userId),
    );
  if (error) throw new Error("メンバー一覧を取得できませんでした。");

  const displayNameByUserId = new Map(
    z
      .array(profileRowSchema)
      .parse(data ?? [])
      .map((profile) => [profile.user_id, profile.display_name]),
  );
  return context.memberships.map((membership) => ({
    membershipId: membership.membershipId,
    displayName:
      displayNameByUserId.get(membership.userId) ??
      (membership.status === "active"
        ? FALLBACK_DISPLAY_NAME
        : REMOVED_DISPLAY_NAME),
    status: membership.status,
    isCurrentUser: membership.isCurrentUser,
  }));
}
