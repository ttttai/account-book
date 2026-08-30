import "server-only";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import type { UpdateIncomeInput } from "../domain/income-input";
import { mapTransactionCommandError } from "./command-error";
import type { TransactionCommandResult } from "./edit-types";

// 認証を確認したうえでDB関数により収入取引を楽観的ロック付きで更新する
export async function updateIncome(
  input: UpdateIncomeInput,
): Promise<TransactionCommandResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    return { kind: "error" };
  }

  const { error } = await supabase.rpc("update_income_transaction", {
    p_group_id: input.groupId,
    p_transaction_id: input.transactionId,
    p_expected_version: input.expectedVersion,
    p_amount_minor: input.amountMinor,
    p_transaction_date: input.transactionDate,
    p_category_id: input.categoryId,
    p_recipient_member_id: input.recipientMemberId,
    p_memo: input.memo,
  });

  if (error) return mapTransactionCommandError(error.code);
  return { kind: "ok" };
}
