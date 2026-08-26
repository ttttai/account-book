import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  acceptInvitationSchema,
  type AcceptInvitationInput,
} from "../domain/invitation-input";
import { hashInvitationToken } from "../domain/invitation-token";
import type { InvitationAcceptanceResult } from "./member-types";

const acceptanceRowSchema = z.object({
  result: z.enum([
    "accepted",
    "already_accepted",
    "not_found",
    "expired",
    "revoked",
    "used",
  ]),
  group_id: z.uuid().nullable(),
});

export async function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<InvitationAcceptanceResult> {
  const validatedInput = acceptInvitationSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  const tokenHash = await hashInvitationToken(validatedInput.token);
  const { data, error } = await supabase.rpc("accept_group_invitation", {
    p_token_hash: tokenHash,
  });
  if (error) throw new Error("INVITATION_ACCEPT_FAILED");

  const [acceptance] = z.array(acceptanceRowSchema).parse(data ?? []);
  if (!acceptance) throw new Error("INVITATION_ACCEPT_FAILED");

  if (
    acceptance.result === "accepted" ||
    acceptance.result === "already_accepted"
  ) {
    if (!acceptance.group_id) throw new Error("INVITATION_ACCEPT_FAILED");
    return { status: acceptance.result, groupId: acceptance.group_id };
  }

  return { status: acceptance.result };
}
