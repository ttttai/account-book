import "server-only";

import { hasRecoveryAuthMethod } from "../domain/auth-claims";
import { createServerSupabaseClient } from "../infrastructure/supabase-server";

export async function hasCurrentRecoverySession(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();

  return !error && hasRecoveryAuthMethod(data?.claims);
}
