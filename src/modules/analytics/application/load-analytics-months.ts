import "server-only";

import type { GroupReadContext } from "@/modules/groups/server";
import { listMonthlyTransactions } from "@/modules/transactions/server";

import {
  aggregateAnalyticsMonth,
  type AnalyticsExpenseInput,
  type AnalyticsMonthTotals,
  type AnalyticsTarget,
} from "../domain/analytics-summary";

// 概要分析・詳細分析・定期レポートが共有する唯一の集計処理 (ANA-012)
// 取引の読み取りと定期取引の展開は共有の`listMonthlyTransactions`に任せ、月ごとの同じ規則で合計する (REC-005)
export async function loadAnalyticsMonths(
  context: GroupReadContext,
  months: readonly string[],
  target: AnalyticsTarget,
): Promise<readonly AnalyticsMonthTotals[]> {
  if (months.length === 0) return [];

  const monthly = await listMonthlyTransactions(
    context.supabase,
    context.group.id,
    months,
  );
  const expenses: readonly AnalyticsExpenseInput[] = monthly.expenses.map(
    (expense) => ({
      date: expense.date,
      amountMinor: expense.amountMinor,
      categoryId: expense.category.id,
      categoryName: expense.category.name,
      categoryColor: expense.category.color,
      allocations: expense.allocations,
    }),
  );

  return months.map((month) =>
    aggregateAnalyticsMonth(month, expenses, monthly.incomes, target),
  );
}
