import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  createInvitationSchema,
  type CreateInvitationInput,
} from "../domain/invitation-input";
import {
  buildInvitationShareUrl,
  hashInvitationToken,
} from "../domain/invitation-token";
import { generateInvitationToken } from "../infrastructure/generate-invitation-token";
import type { CreatedInvitation } from "./member-types";

const createdRowSchema = z.object({
  invitation_id: z.uuid(),
  expires_at: z.string(),
});

// 共有URLの基点。未設定時はローカル開発用アドレスにfallbackする
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

// 招待トークンを発行し、ハッシュのみをDBへ保存して共有URLを返す
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreatedInvitation> {
  const validatedInput = createInvitationSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  // 生トークンはこのレスポンスでしか渡らない。DBにはハッシュだけを残す
  const rawToken = generateInvitationToken();
  const tokenHash = await hashInvitationToken(rawToken);
  const { data, error } = await supabase.rpc("create_group_invitation", {
    p_group_id: validatedInput.groupId,
    p_role: validatedInput.role,
    p_token_hash: tokenHash,
  });
  if (error) throw new Error("INVITATION_CREATE_FAILED");

  const [created] = z.array(createdRowSchema).parse(data ?? []);
  const shareUrl = buildInvitationShareUrl(siteUrl(), rawToken);
  if (!created || !shareUrl) throw new Error("INVITATION_CREATE_FAILED");

  return {
    id: created.invitation_id,
    role: validatedInput.role,
    expiresAt: created.expires_at,
    shareUrl,
  };
}
