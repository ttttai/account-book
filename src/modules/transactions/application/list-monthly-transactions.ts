import "server-only";

import { z } from "zod";

import type { createServerSupabaseClient } from "@/modules/auth/server";
import {
  expandRecurringForMonth,
  listRecurringSchedules,
} from "@/modules/recurring/server";

import { monthlyDateRange } from "../domain/monthly-range";
import type {
  MonthlyExpense,
  MonthlyIncome,
  MonthlyTransactions,
} from "./monthly-transaction-types";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

const safeAmountSchema = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
]);
const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  icon: z.string(),
});
const expenseRowSchema = z.object({
  id: z.uuid(),
  transaction_date: z.string(),
  amount_minor: safeAmountSchema,
  payer_member_id: z.uuid(),
  created_at: z.string(),
  memo: z.string().nullable().default(null),
  categories: categorySchema,
  transaction_allocations: z.array(
    z.object({ member_id: z.uuid(), amount_minor: safeAmountSchema }),
  ),
});
const incomeRowSchema = z.object({
  id: z.uuid(),
  transaction_date: z.string(),
  amount_minor: safeAmountSchema,
  recipient_member_id: z.uuid(),
  created_at: z.string(),
  memo: z.string().nullable().default(null),
  categories: categorySchema,
});

const CATEGORY_COLUMNS =
  "categories!transactions_category_group_fk(id, name, color, icon)";
const EXPENSE_COLUMNS = `id, transaction_date, amount_minor, payer_member_id, created_at, memo, ${CATEGORY_COLUMNS}, transaction_allocations!transaction_allocations_transaction_group_fk(member_id, amount_minor)`;
const INCOME_COLUMNS = `id, transaction_date, amount_minor, recipient_member_id, created_at, memo, ${CATEGORY_COLUMNS}`;

// 展開結果は登録日時を持たないため、日別表示では単発取引より後ろへ並ぶ固定値を使う
const RECURRING_SORT_KEY = "0000-01-01T00:00:00.000Z";

// 月次の表示・集計が共有する取引読み取り。指定月の未削除の支出・収入を半開区間で読み、定期取引を同じ月へ展開して合流させる
// 認可は呼び出し側のcontextで確認済みとし、RLS適用のユーザーsession clientで読む。展開結果はDBへ保存せず、単発取引と重複しない (REC-005)
export async function listMonthlyTransactions(
  supabase: ServerSupabaseClient,
  groupId: string,
  months: readonly string[],
): Promise<MonthlyTransactions> {
  if (months.length === 0) return { expenses: [], incomes: [] };
  const { start, endExclusive } = monthlyDateRange(months);

  const [expenseResult, incomeResult, schedules] = await Promise.all([
    supabase
      .from("transactions")
      .select(EXPENSE_COLUMNS)
      .eq("group_id", groupId)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("transaction_date", start)
      .lt("transaction_date", endExclusive)
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select(INCOME_COLUMNS)
      .eq("group_id", groupId)
      .eq("type", "income")
      .is("deleted_at", null)
      .gte("transaction_date", start)
      .lt("transaction_date", endExclusive)
      .order("created_at", { ascending: false }),
    listRecurringSchedules(supabase, groupId),
  ]);
  if (expenseResult.error || incomeResult.error) {
    throw new Error("取引を取得できませんでした。");
  }

  const expenses: MonthlyExpense[] = z
    .array(expenseRowSchema)
    .parse(expenseResult.data ?? [])
    .map((row) => ({
      id: row.id,
      date: row.transaction_date,
      amountMinor: row.amount_minor,
      payerMemberId: row.payer_member_id,
      createdAt: row.created_at,
      memo: row.memo,
      category: row.categories,
      allocations: row.transaction_allocations.map((allocation) => ({
        memberId: allocation.member_id,
        amountMinor: allocation.amount_minor,
      })),
      isRecurring: false,
    }));
  const incomes: MonthlyIncome[] = z
    .array(incomeRowSchema)
    .parse(incomeResult.data ?? [])
    .map((row) => ({
      id: row.id,
      date: row.transaction_date,
      amountMinor: row.amount_minor,
      recipientMemberId: row.recipient_member_id,
      createdAt: row.created_at,
      memo: row.memo,
      category: row.categories,
      isRecurring: false,
    }));

  // 定期取引は設定から各月へ展開する。transactionsを読まずに作るため、単発取引との二重集計は構造的に発生しない
  for (const month of months) {
    for (const occurrence of expandRecurringForMonth(schedules, month)) {
      if (occurrence.type === "expense") {
        expenses.push({
          id: occurrence.occurrenceId,
          date: occurrence.date,
          amountMinor: occurrence.amountMinor,
          payerMemberId: occurrence.payerMemberId ?? "",
          createdAt: RECURRING_SORT_KEY,
          memo: occurrence.memo,
          category: occurrence.category,
          allocations: occurrence.allocations,
          isRecurring: true,
          recurringName: occurrence.name,
        });
        continue;
      }
      incomes.push({
        id: occurrence.occurrenceId,
        date: occurrence.date,
        amountMinor: occurrence.amountMinor,
        recipientMemberId: occurrence.recipientMemberId ?? "",
        createdAt: RECURRING_SORT_KEY,
        memo: occurrence.memo,
        category: occurrence.category,
        isRecurring: true,
        recurringName: occurrence.name,
      });
    }
  }

  return { expenses, incomes };
}
