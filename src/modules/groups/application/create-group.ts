import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/modules/auth/server";

import type { CreateGroupInput } from "../domain/group-input";

export async function createGroup(input: CreateGroupInput): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data, error } = await supabase.rpc("create_group", {
    p_name: input.name,
    p_week_starts_on: input.weekStartsOn,
    p_default_allocation: input.defaultAllocation,
  });

  if (error) throw new Error("グループを作成できませんでした。");
  return z.uuid().parse(data);
}
