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

const preferenceRowSchema = z.object({
  default_group_id: z.uuid().nullable(),
});

// ログイン中ユーザーが設定した起動時に開くグループIDを返す（未設定・未認証はnull）
export async function getDefaultGroupId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  // Auth APIの応答不能は未設定へ縮退させず、routeのerror境界へ委ねる (AC-AUTH-004-4)
  if (isUnavailableAuthError(claimsError)) {
    throw new BackendUnavailableError("groups.defaultGroup.getClaims");
  }
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const result = await supabase
    .from("user_preferences")
    .select("default_group_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    // 失効session等の認証起因の失敗はserver errorにせず、未設定と同じ判定へ縮退させる。
    if (isAuthenticationQueryError(result.error)) return null;
    throw createQueryFailureError(
      "groups.defaultGroup",
      result,
      "起動時に開くグループを取得できませんでした。",
    );
  }
  if (!result.data) return null;
  return preferenceRowSchema.parse(result.data).default_group_id;
}

// 起動時に開くグループをDB関数で設定（groupId）または解除（null）する。所属の再確認はDB関数側で行う
export async function setDefaultGroup(groupId: string | null): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  const { error } = await supabase.rpc("set_default_group", {
    p_group_id: groupId,
  });
  if (error) throw new Error("DEFAULT_GROUP_UPDATE_FAILED");
}
