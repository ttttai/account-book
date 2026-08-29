import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  changeMemberRoleSchema,
  type ChangeMemberRoleInput,
} from "../domain/member-administration-input";

const changeResultSchema = z.enum([
  "changed",
  "unchanged",
  "not_found",
  "last_owner",
]);

export type ChangeMemberRoleResult = z.infer<typeof changeResultSchema>;

export async function changeMemberRole(
  input: ChangeMemberRoleInput,
): Promise<ChangeMemberRoleResult> {
  const validatedInput = changeMemberRoleSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data, error } = await supabase.rpc("change_group_member_role", {
    p_group_id: validatedInput.groupId,
    p_membership_id: validatedInput.membershipId,
    p_role: validatedInput.role,
  });
  if (error) throw new Error("MEMBER_ROLE_CHANGE_FAILED");
  return changeResultSchema.parse(data);
}
