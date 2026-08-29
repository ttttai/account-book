import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  removeMemberSchema,
  type RemoveMemberInput,
} from "../domain/member-administration-input";

const removalResultSchema = z.enum([
  "removed",
  "not_found",
  "owner_not_removable",
]);

export type RemoveMemberResult = z.infer<typeof removalResultSchema>;

export async function removeMember(
  input: RemoveMemberInput,
): Promise<RemoveMemberResult> {
  const validatedInput = removeMemberSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data, error } = await supabase.rpc("remove_group_member", {
    p_group_id: validatedInput.groupId,
    p_membership_id: validatedInput.membershipId,
  });
  if (error) throw new Error("MEMBER_REMOVE_FAILED");
  return removalResultSchema.parse(data);
}
