import "server-only";

import { getAllowedGoogleUserId } from "../infrastructure/google-auth-access";
import { createServerSupabaseClient } from "../infrastructure/supabase-server";

export type CurrentProfile = Readonly<{
  userId: string;
  displayName: string;
}>;

// 認証済みユーザーのプロフィール（表示名）を取得する。未認証・許可外なら null を返す
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  // Google OAuth の許可リストに含まれるユーザーのみ通す
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .single();

  if (!profile) return null;
  return {
    userId,
    displayName: profile.display_name,
  };
}
