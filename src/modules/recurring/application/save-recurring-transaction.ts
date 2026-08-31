import "server-only";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { monthToFirstDay } from "../domain/recurring-input";
import type {
  CreateRecurringInput,
  EndRecurringInput,
  UpdateRecurringInput,
} from "../domain/recurring-input";
import type { RecurringAllocation } from "../domain/recurring-schedule";
import {
  logRecurringCommandFailure,
  mapRecurringCommandError,
} from "./recurring-command-error";
import type { RecurringCommandResult } from "./recurring-types";

// 収入は負担行を持たないため、DB関数へは空配列を渡す（REC-003）
function allocationPayload(
  type: "expense" | "income",
  allocations: readonly RecurringAllocation[],
) {
  if (type === "income") return [];
  return allocations.map((allocation) => ({
    member_id: allocation.memberId,
    amount_minor: allocation.amountMinor,
  }));
}

async function authenticatedClient() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) return null;
  return supabase;
}

// 認証を確認したうえでDB関数により定期取引を作成する（owner/adminはDB側で再確認する）
export async function createRecurringTransaction(
  input: CreateRecurringInput,
  allocations: readonly RecurringAllocation[],
): Promise<RecurringCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { error } = await supabase.rpc("create_recurring_transaction", {
    p_group_id: input.groupId,
    p_type: input.type,
    p_name: input.name,
    p_amount_minor: input.amountMinor,
    p_day_of_month: input.dayOfMonth,
    p_start_month: monthToFirstDay(input.startMonth),
    p_end_month:
      input.endMonth === null ? null : monthToFirstDay(input.endMonth),
    p_category_id: input.categoryId,
    p_payer_member_id: input.type === "expense" ? input.partyMemberId : null,
    p_recipient_member_id: input.type === "income" ? input.partyMemberId : null,
    p_memo: input.memo,
    p_allocations: allocationPayload(input.type, allocations),
  });

  if (error) {
    logRecurringCommandFailure("createRecurringTransaction", error.code);
    return mapRecurringCommandError(error.code);
  }
  return { kind: "ok" };
}

// 認証を確認したうえでDB関数により定期取引を楽観的ロック付きで更新する
export async function updateRecurringTransaction(
  input: UpdateRecurringInput,
  allocations: readonly RecurringAllocation[],
): Promise<RecurringCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { error } = await supabase.rpc("update_recurring_transaction", {
    p_group_id: input.groupId,
    p_recurring_transaction_id: input.recurringTransactionId,
    p_expected_version: input.expectedVersion,
    p_name: input.name,
    p_amount_minor: input.amountMinor,
    p_day_of_month: input.dayOfMonth,
    p_start_month: monthToFirstDay(input.startMonth),
    p_end_month:
      input.endMonth === null ? null : monthToFirstDay(input.endMonth),
    p_category_id: input.categoryId,
    p_payer_member_id: input.type === "expense" ? input.partyMemberId : null,
    p_recipient_member_id: input.type === "income" ? input.partyMemberId : null,
    p_memo: input.memo,
    p_allocations: allocationPayload(input.type, allocations),
  });

  if (error) {
    logRecurringCommandFailure("updateRecurringTransaction", error.code);
    return mapRecurringCommandError(error.code);
  }
  return { kind: "ok" };
}

// 認証を確認したうえでDB関数により定期取引を終了する（翌月以降は展開しない）
export async function endRecurringTransaction(
  input: EndRecurringInput,
): Promise<RecurringCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { error } = await supabase.rpc("end_recurring_transaction", {
    p_group_id: input.groupId,
    p_recurring_transaction_id: input.recurringTransactionId,
    p_expected_version: input.expectedVersion,
    p_end_month: monthToFirstDay(input.endMonth),
  });

  if (error) {
    logRecurringCommandFailure("endRecurringTransaction", error.code);
    return mapRecurringCommandError(error.code);
  }
  return { kind: "ok" };
}
