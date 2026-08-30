import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { mapTransactionCommandError } from "./command-error";
import type { TransactionCommandResult } from "./edit-types";

const inputSchema = z.object({
  groupId: z.uuid(),
  transactionId: z.uuid(),
  expectedVersion: z.number().int().min(1),
});

// 認証を確認したうえでDB関数により削除済み取引を復元する（30日期限はDB側でも再検証される）
export async function restoreTransaction(
  input: z.infer<typeof inputSchema>,
): Promise<TransactionCommandResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error" };

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    return { kind: "error" };
  }

  const { error } = await supabase.rpc("restore_transaction", {
    p_group_id: parsed.data.groupId,
    p_transaction_id: parsed.data.transactionId,
    p_expected_version: parsed.data.expectedVersion,
  });

  if (error) return mapTransactionCommandError(error.code);
  return { kind: "ok" };
}
