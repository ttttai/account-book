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

import type {
  GroupMemberSummary,
  GroupMembershipDetails,
  PendingInvitationSummary,
} from "./member-types";

const groupIdSchema = z.uuid();
const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  currency: z.literal("JPY"),
  timezone: z.string(),
  week_starts_on: z.union([z.literal(0), z.literal(1)]),
  default_allocation: z.enum(["equal", "self"]),
  version: z.number().int().min(1),
});
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
const invitationRowSchema = z.object({
  invitation_id: z.uuid(),
  role: z.enum(["admin", "member"]),
  expires_at: z.string(),
  created_at: z.string(),
});

// グループ情報・メンバー一覧・（管理者向けの）保留招待をまとめて取得する
// 未認証や非メンバーはnullを返し、閲覧不可として扱う。バックエンドの応答不能はnullへ縮退させず例外にする (AC-AUTH-004-4)
export async function getGroupMembership(
  unsafeGroupId: string,
): Promise<GroupMembershipDetails | null> {
  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (isUnavailableAuthError(claimsError)) {
    throw new BackendUnavailableError("groups.membership.getClaims");
  }
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const [groupResult, membershipResult] = await Promise.all([
    supabase
      .from("groups")
      .select(
        "id, name, currency, timezone, week_starts_on, default_allocation, version",
      )
      .eq("id", groupIdResult.data)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("id, user_id, role, joined_at")
      .eq("group_id", groupIdResult.data)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
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
      "groups.membership",
      failedResult,
      "グループを取得できませんでした。",
    );
  }
  if (!groupResult.data) return null;

  const group = groupRowSchema.parse(groupResult.data);
  const memberships = z
    .array(membershipRowSchema)
    .parse(membershipResult.data ?? []);
  const currentMembership = memberships.find(
    (membership) => membership.user_id === userId,
  );
  // 自分がactiveなメンバーでなければグループ自体を見せない
  if (!currentMembership) return null;

  const memberUserIds = memberships.map((membership) => membership.user_id);
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", memberUserIds);
  if (profileError) throw new Error("メンバー一覧を取得できませんでした。");

  const profileByUserId = new Map(
    z
      .array(profileRowSchema)
      .parse(profileData ?? [])
      .map((profile) => [profile.user_id, profile.display_name]),
  );
  const members: GroupMemberSummary[] = memberships.map((membership) => ({
    membershipId: membership.id,
    displayName: profileByUserId.get(membership.user_id) ?? "メンバー",
    role: membership.role,
    joinedAt: membership.joined_at,
    isCurrentUser: membership.user_id === userId,
  }));

  let pendingInvitations: readonly PendingInvitationSummary[] = [];
  // 保留中の招待はowner/adminにのみ開示する
  if (["owner", "admin"].includes(currentMembership.role)) {
    const { data, error } = await supabase.rpc(
      "list_pending_group_invitations",
      { p_group_id: groupIdResult.data },
    );
    if (error) throw new Error("招待一覧を取得できませんでした。");
    pendingInvitations = z
      .array(invitationRowSchema)
      .parse(data ?? [])
      .map((invitation) => ({
        id: invitation.invitation_id,
        role: invitation.role,
        expiresAt: invitation.expires_at,
        createdAt: invitation.created_at,
      }));
  }

  return {
    group: {
      membershipId: currentMembership.id,
      id: group.id,
      name: group.name,
      currency: group.currency,
      timezone: group.timezone,
      weekStartsOn: group.week_starts_on,
      defaultAllocation: group.default_allocation,
      version: group.version,
      role: currentMembership.role,
    },
    currentRole: currentMembership.role,
    members,
    pendingInvitations,
  };
}
