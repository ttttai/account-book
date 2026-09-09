import "server-only";

import {
  BackendUnavailableError,
  createQueryFailureError,
  isUnavailableAuthError,
} from "../domain/backend-availability";
import { isAuthenticationQueryError } from "../domain/postgrest-auth-error";
import { getAllowedGoogleUserId } from "../infrastructure/google-auth-access";
import { createServerSupabaseClient } from "../infrastructure/supabase-server";

export type CurrentProfile = Readonly<{
  userId: string;
  displayName: string;
}>;

// 認証済みユーザーのプロフィール（表示名）を取得する。未認証・許可外なら null を返す
// バックエンドの応答不能は未認証へ縮退させず例外にし、routeのerror境界へ委ねる (AC-AUTH-004-4)
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (isUnavailableAuthError(claimsError)) {
    throw new BackendUnavailableError("auth.getClaims");
  }
  // Google OAuth の許可リストに含まれるユーザーのみ通す
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const result = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    // 失効session等の認証起因の失敗だけを未認証へ縮退させる (AC-AUTH-001-9)
    if (isAuthenticationQueryError(result.error)) return null;
    throw createQueryFailureError(
      "profiles.select",
      result,
      "プロフィールを取得できませんでした。",
    );
  }
  if (!result.data) return null;
  return {
    userId,
    displayName: result.data.display_name,
  };
}
