import "server-only";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import type { ExpenseAllocation } from "../domain/expense-allocation";
import type { UpdateExpenseInput } from "../domain/update-expense-input";
import {
  logTransactionCommandFailure,
  mapTransactionCommandError,
} from "./command-error";
import type { TransactionCommandResult } from "./edit-types";

// 認証を確認したうえでDB関数により支出取引を楽観的ロック付きで更新する
export async function updateExpense(
  input: UpdateExpenseInput,
  allocations: readonly ExpenseAllocation[],
): Promise<TransactionCommandResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    return { kind: "error" };
  }

  const { error } = await supabase.rpc("update_expense_transaction", {
    p_group_id: input.groupId,
    p_transaction_id: input.transactionId,
    p_expected_version: input.expectedVersion,
    p_amount_minor: input.amountMinor,
    p_transaction_date: input.transactionDate,
    p_category_id: input.categoryId,
    p_payer_member_id: input.payerMemberId,
    p_memo: input.memo,
    p_allocations: allocations.map((allocation) => ({
      member_id: allocation.memberId,
      amount_minor: allocation.amountMinor,
    })),
  });

  if (error) {
    logTransactionCommandFailure("updateExpense", error.code);
    return mapTransactionCommandError(error.code);
  }
  return { kind: "ok" };
}
