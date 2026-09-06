import "server-only";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import type {
  DisableBudgetInput,
  SetBudgetInput,
} from "../domain/budget-input";
import { monthToFirstDay } from "../domain/budget-revision";
import {
  logBudgetCommandFailure,
  mapBudgetCommandError,
} from "./budget-command-error";
import type { BudgetCommandResult } from "./budget-types";

async function authenticatedClient() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) return null;
  return supabase;
}

// 認証を確認したうえでDB関数により予算改定を作成または更新する（owner/admin・当月以降・合計上限はDB側で再確認する）
export async function setGroupBudget(
  input: SetBudgetInput,
): Promise<BudgetCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { error } = await supabase.rpc("set_group_budget", {
    p_group_id: input.groupId,
    p_effective_month: monthToFirstDay(input.effectiveMonth),
    p_expected_version: input.expectedVersion,
    p_total_amount_minor: input.totalAmountMinor,
    p_category_limits: input.categoryLimits.map((limit) => ({
      category_id: limit.categoryId,
      amount_minor: limit.amountMinor,
    })),
  });

  if (error) {
    logBudgetCommandFailure("setGroupBudget", error.code);
    return mapBudgetCommandError(error.code);
  }
  return { kind: "ok" };
}

// 認証を確認したうえでDB関数により停止改定を作成または更新する (AC-BUD-006-1)
export async function disableGroupBudget(
  input: DisableBudgetInput,
): Promise<BudgetCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { error } = await supabase.rpc("disable_group_budget", {
    p_group_id: input.groupId,
    p_effective_month: monthToFirstDay(input.effectiveMonth),
    p_expected_version: input.expectedVersion,
  });

  if (error) {
    logBudgetCommandFailure("disableGroupBudget", error.code);
    return mapBudgetCommandError(error.code);
  }
  return { kind: "ok" };
}
