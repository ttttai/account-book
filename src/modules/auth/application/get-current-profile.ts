import "server-only";

import { getAllowedGoogleUserId } from "../infrastructure/google-auth-access";
import { createServerSupabaseClient } from "../infrastructure/supabase-server";

export type CurrentProfile = Readonly<{
  userId: string;
  displayName: string;
}>;

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
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
