import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import type { CreateIncomeInput } from "../domain/income-input";

// 認証を確認したうえでDB関数により収入取引を登録し、作成された取引IDを返す
export async function createIncome(input: CreateIncomeInput): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  // clientRequestIdをDB側で照合するため、二重送信でも同一取引が返る（冪等性）
  const { data, error } = await supabase.rpc("create_income_transaction", {
    p_group_id: input.groupId,
    p_amount_minor: input.amountMinor,
    p_transaction_date: input.transactionDate,
    p_category_id: input.categoryId,
    p_recipient_member_id: input.recipientMemberId,
    p_memo: input.memo,
    p_client_request_id: input.clientRequestId,
  });

  if (error) throw new Error("収入を登録できませんでした。");
  return z.uuid().parse(data);
}
