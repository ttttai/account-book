import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import type { ExpenseAllocation } from "../domain/expense-allocation";
import type { CreateExpenseInput } from "../domain/expense-input";
import { logTransactionCommandFailure } from "./command-error";

// 認証を確認したうえでDB関数により支出取引と負担配分を登録し、作成された取引IDを返す
export async function createExpense(
  input: CreateExpenseInput,
  allocations: readonly ExpenseAllocation[],
): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  // clientRequestIdをDB側で照合するため、二重送信でも同一取引が返る（冪等性）
  const { data, error } = await supabase.rpc("create_expense_transaction", {
    p_group_id: input.groupId,
    p_amount_minor: input.amountMinor,
    p_transaction_date: input.transactionDate,
    p_category_id: input.categoryId,
    p_payer_member_id: input.payerMemberId,
    p_memo: input.memo,
    p_client_request_id: input.clientRequestId,
    p_allocations: allocations.map((allocation) => ({
      member_id: allocation.memberId,
      amount_minor: allocation.amountMinor,
    })),
  });

  if (error) {
    logTransactionCommandFailure("createExpense", error.code);
    throw new Error("支出を登録できませんでした。");
  }
  return z.uuid().parse(data);
}
