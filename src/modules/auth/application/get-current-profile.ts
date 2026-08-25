import "server-only";

import { createServerSupabaseClient } from "../infrastructure/supabase-server";

export type CurrentProfile = Readonly<{
  userId: string;
  displayName: string;
  email: string | null;
}>;

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return null;

  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .single();

  if (!profile) return null;
  return {
    userId,
    displayName: profile.display_name,
    email: userData.user?.email ?? null,
  };
}
