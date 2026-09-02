import "server-only";

import type { GroupReadContext } from "@/modules/groups/server";
import {
  listMonthlyTransactions,
  type MonthlyTransactions,
} from "@/modules/transactions/server";

import {
  aggregateAnalyticsMonth,
  type AnalyticsExpenseInput,
  type AnalyticsMonthTotals,
  type AnalyticsTarget,
} from "../domain/analytics-summary";

export type AnalyticsTransactionInputs = Readonly<{
  expenses: readonly AnalyticsExpenseInput[];
  incomes: MonthlyTransactions["incomes"];
}>;

// 共有月次読み取りを分析用の最小入力へ変換する
export async function loadAnalyticsTransactionInputs(
  context: GroupReadContext,
  months: readonly string[],
): Promise<AnalyticsTransactionInputs> {
  if (months.length === 0) return { expenses: [], incomes: [] };
  const monthly = await listMonthlyTransactions(
    context.supabase,
    context.group.id,
    months,
  );
  return {
    expenses: monthly.expenses.map((expense) => ({
      date: expense.date,
      amountMinor: expense.amountMinor,
      payerMemberId: expense.payerMemberId,
      categoryId: expense.category.id,
      categoryName: expense.category.name,
      categoryColor: expense.category.color,
      allocations: expense.allocations,
    })),
    incomes: monthly.incomes,
  };
}

// 読み込み済みの同じ取引集合から月別集計を作る
export function aggregateAnalyticsMonths(
  months: readonly string[],
  inputs: AnalyticsTransactionInputs,
  target: AnalyticsTarget,
): readonly AnalyticsMonthTotals[] {
  return months.map((month) =>
    aggregateAnalyticsMonth(month, inputs.expenses, inputs.incomes, target),
  );
}

// 概要分析・詳細分析・定期レポートが共有する唯一の集計処理 (ANA-012)
// 取引の読み取りと定期取引の展開は共有の`listMonthlyTransactions`に任せ、月ごとの同じ規則で合計する (REC-005)
export async function loadAnalyticsMonths(
  context: GroupReadContext,
  months: readonly string[],
  target: AnalyticsTarget,
): Promise<readonly AnalyticsMonthTotals[]> {
  const inputs = await loadAnalyticsTransactionInputs(context, months);
  return aggregateAnalyticsMonths(months, inputs, target);
}
