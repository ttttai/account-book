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

import type { GroupSummary } from "./group-types";

const membershipRowSchema = z.object({
  id: z.uuid(),
  role: z.enum(["owner", "admin", "member"]),
  groups: z.object({
    id: z.uuid(),
    name: z.string(),
    currency: z.literal("JPY"),
    timezone: z.string(),
    week_starts_on: z.union([z.literal(0), z.literal(1)]),
    default_allocation: z.enum(["equal", "self"]),
    version: z.number().int().min(1),
  }),
});

// ログイン中ユーザーが参加しているグループを参加順で返す（未認証は空配列）
export async function listMyGroups(): Promise<readonly GroupSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  // Auth APIの応答不能は未認証へ縮退させず、routeのerror境界へ委ねる (AC-AUTH-004-4)
  if (isUnavailableAuthError(claimsError)) {
    throw new BackendUnavailableError("groups.listMyGroups.getClaims");
  }
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return [];

  const result = await supabase
    .from("group_members")
    .select(
      "id, role, groups!inner(id, name, currency, timezone, week_starts_on, default_allocation, version)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (result.error) {
    // 失効session等の認証起因の失敗はserver errorにせず、未認証としてログイン誘導へ合流させる。
    if (isAuthenticationQueryError(result.error)) return [];
    throw createQueryFailureError(
      "groups.listMyGroups",
      result,
      "グループ一覧を取得できませんでした。",
    );
  }

  return z
    .array(membershipRowSchema)
    .parse(result.data ?? [])
    .map((membership) => ({
      membershipId: membership.id,
      id: membership.groups.id,
      name: membership.groups.name,
      currency: membership.groups.currency,
      timezone: membership.groups.timezone,
      weekStartsOn: membership.groups.week_starts_on,
      defaultAllocation: membership.groups.default_allocation,
      version: membership.groups.version,
      role: membership.role,
    }));
}
