import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  logTransactionCommandFailure,
  mapTransactionCommandError,
} from "./command-error";
import type { TransactionCommandResult } from "./edit-types";

const inputSchema = z.object({
  groupId: z.uuid(),
  transactionId: z.uuid(),
  expectedVersion: z.number().int().min(1),
});

// 認証を確認したうえでDB関数により取引と負担行を物理削除する（再送は冪等に成功する）
export async function deleteTransaction(
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

  const { error } = await supabase.rpc("delete_transaction", {
    p_group_id: parsed.data.groupId,
    p_transaction_id: parsed.data.transactionId,
    p_expected_version: parsed.data.expectedVersion,
  });

  if (error) {
    logTransactionCommandFailure("deleteTransaction", error.code);
    return mapTransactionCommandError(error.code);
  }
  return { kind: "ok" };
}
