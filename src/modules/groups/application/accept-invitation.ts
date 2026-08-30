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

// accept_group_invitation RPCが返す行の形（resultで受諾結果の状態を表す）
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

// 招待トークンを検証し、RPC経由でグループ参加を確定する
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

  // 生トークンはDBに渡さず、ハッシュのみで照合する
  const tokenHash = await hashInvitationToken(validatedInput.token);
  const { data, error } = await supabase.rpc("accept_group_invitation", {
    p_token_hash: tokenHash,
  });
  if (error) throw new Error("INVITATION_ACCEPT_FAILED");

  const [acceptance] = z.array(acceptanceRowSchema).parse(data ?? []);
  if (!acceptance) throw new Error("INVITATION_ACCEPT_FAILED");

  // 参加成立時のみgroup_idが返る。それ以外は失敗理由をそのまま返す
  if (
    acceptance.result === "accepted" ||
    acceptance.result === "already_accepted"
  ) {
    if (!acceptance.group_id) throw new Error("INVITATION_ACCEPT_FAILED");
    return { status: acceptance.result, groupId: acceptance.group_id };
  }

  return { status: acceptance.result };
}
