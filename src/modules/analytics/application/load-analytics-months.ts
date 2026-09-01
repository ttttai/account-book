import "server-only";

import { z } from "zod";

import {
  expandRecurringForMonth,
  listRecurringSchedules,
} from "@/modules/recurring/server";

import { analyticsMonthRange } from "../domain/analytics-month";
import {
  aggregateAnalyticsMonth,
  type AnalyticsExpenseInput,
  type AnalyticsIncomeInput,
  type AnalyticsMonthTotals,
  type AnalyticsTarget,
} from "../domain/analytics-summary";
import type { AnalyticsContext } from "./analytics-context";

const safeAmountSchema = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
]);
const categorySchema = z.object({ name: z.string(), color: z.string() });
const expenseRowSchema = z.object({
  transaction_date: z.string(),
  amount_minor: safeAmountSchema,
  category_id: z.uuid(),
  categories: categorySchema,
  transaction_allocations: z.array(
    z.object({ member_id: z.uuid(), amount_minor: safeAmountSchema }),
  ),
});
const incomeRowSchema = z.object({
  transaction_date: z.string(),
  amount_minor: safeAmountSchema,
  recipient_member_id: z.uuid(),
});

const EXPENSE_COLUMNS =
  "transaction_date, amount_minor, category_id, categories!transactions_category_group_fk(name, color), transaction_allocations!transaction_allocations_transaction_group_fk(member_id, amount_minor)";
const INCOME_COLUMNS = "transaction_date, amount_minor, recipient_member_id";

// 概要分析・詳細分析・定期レポートが共有する唯一の集計処理 (ANA-012)
// 期間内の取引と定期取引の展開結果を、月ごとの同じ規則で合計する
export async function loadAnalyticsMonths(
  context: AnalyticsContext,
  months: readonly string[],
  target: AnalyticsTarget,
): Promise<readonly AnalyticsMonthTotals[]> {
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  if (!firstMonth || !lastMonth) return [];
  const { start, endExclusive } = analyticsMonthRange(firstMonth, lastMonth);

  const [expenseResult, incomeResult, schedules] = await Promise.all([
    context.supabase
      .from("transactions")
      .select(EXPENSE_COLUMNS)
      .eq("group_id", context.group.id)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("transaction_date", start)
      .lt("transaction_date", endExclusive),
    context.supabase
      .from("transactions")
      .select(INCOME_COLUMNS)
      .eq("group_id", context.group.id)
      .eq("type", "income")
      .is("deleted_at", null)
      .gte("transaction_date", start)
      .lt("transaction_date", endExclusive),
    listRecurringSchedules(context.supabase, context.group.id),
  ]);
  if (expenseResult.error || incomeResult.error) {
    throw new Error("分析データを取得できませんでした。");
  }

  const expenses: AnalyticsExpenseInput[] = z
    .array(expenseRowSchema)
    .parse(expenseResult.data ?? [])
    .map((row) => ({
      date: row.transaction_date,
      amountMinor: row.amount_minor,
      categoryId: row.category_id,
      categoryName: row.categories.name,
      categoryColor: row.categories.color,
      allocations: row.transaction_allocations.map((allocation) => ({
        memberId: allocation.member_id,
        amountMinor: allocation.amount_minor,
      })),
    }));
  const incomes: AnalyticsIncomeInput[] = z
    .array(incomeRowSchema)
    .parse(incomeResult.data ?? [])
    .map((row) => ({
      date: row.transaction_date,
      amountMinor: row.amount_minor,
      recipientMemberId: row.recipient_member_id,
    }));

  // 定期取引はカレンダーと同じ規則で各月へ展開する。DBへ保存せず単発取引とは別経路で作るため二重集計しない (REC-005)
  for (const month of months) {
    for (const occurrence of expandRecurringForMonth(schedules, month)) {
      if (occurrence.type === "expense") {
        expenses.push({
          date: occurrence.date,
          amountMinor: occurrence.amountMinor,
          categoryId: occurrence.category.id,
          categoryName: occurrence.category.name,
          categoryColor: occurrence.category.color,
          allocations: occurrence.allocations,
        });
        continue;
      }
      if (occurrence.recipientMemberId) {
        incomes.push({
          date: occurrence.date,
          amountMinor: occurrence.amountMinor,
          recipientMemberId: occurrence.recipientMemberId,
        });
      }
    }
  }

  return months.map((month) =>
    aggregateAnalyticsMonth(month, expenses, incomes, target),
  );
}
