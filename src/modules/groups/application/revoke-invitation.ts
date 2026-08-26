import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  revokeInvitationSchema,
  type RevokeInvitationInput,
} from "../domain/invitation-input";

const revocationResultSchema = z.enum(["revoked", "not_found"]);

export async function revokeInvitation(
  input: RevokeInvitationInput,
): Promise<boolean> {
  const validatedInput = revokeInvitationSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data, error } = await supabase.rpc("revoke_group_invitation", {
    p_group_id: validatedInput.groupId,
    p_invitation_id: validatedInput.invitationId,
  });
  if (error) throw new Error("INVITATION_REVOKE_FAILED");
  return revocationResultSchema.parse(data) === "revoked";
}
