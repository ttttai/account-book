import "server-only";

import { z } from "zod";

import {
  aggregateAnalyticsMonth,
  isAnalyticsMonth,
  shiftAnalyticsMonth,
} from "@/modules/analytics";
import {
  type GroupReadContext,
  resolveGroupReadContext,
} from "@/modules/groups/server";
import { listMonthlyTransactions } from "@/modules/transactions/server";

import { calculateBudgetProgress } from "../domain/budget-progress";
import {
  isBudgetMonthEditable,
  resolveAppliedBudgetRevision,
} from "../domain/budget-revision";
import type {
  BudgetCategoryOption,
  BudgetSearchInput,
  BudgetView,
} from "./budget-types";
import { loadBudgetRevisions } from "./load-budget-revisions";

const roleRowSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});
const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
});

// 未指定はundefined、文字列以外（配列など）はnullを返して不正扱いにする
function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

// 操作者のroleは所属IDで1行だけ読む。表示制御にだけ使い、認可判断はDB関数が再確認する
async function loadCurrentRole(
  context: GroupReadContext,
): Promise<"owner" | "admin" | "member"> {
  const { data, error } = await context.supabase
    .from("group_members")
    .select("role")
    .eq("id", context.currentMembershipId)
    .maybeSingle();
  if (error || !data) throw new Error("予算を取得できませんでした。");
  return roleRowSchema.parse(data).role;
}

// フォームで内訳を設定できる、アクティブな支出カテゴリだけを並び順で読む
async function loadExpenseCategories(
  context: GroupReadContext,
): Promise<readonly BudgetCategoryOption[]> {
  const { data, error } = await context.supabase
    .from("categories")
    .select("id, name, color, sort_order")
    .eq("group_id", context.group.id)
    .eq("type", "expense")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("予算を取得できませんでした。");
  return z
    .array(categoryRowSchema)
    .parse(data ?? [])
    .map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
    }));
}

// 予算画面の表示データを取得する。認証・所属確認と月の検証を行い、不正な月では予算と取引を読まない (AC-BUD-003-1、AC-BUD-003-2)
// 実績は共有月次読み取りと分析と同じ集計純関数で求め、進捗は分析概要と同じ純関数で作る (BUD-010)
export async function getGroupBudget(
  unsafeGroupId: string,
  search: BudgetSearchInput,
): Promise<BudgetView | null> {
  const context = await resolveGroupReadContext(unsafeGroupId);
  if (!context) return null;

  const monthValue = optionalString(search.month);
  const month = monthValue === undefined ? context.currentMonth : monthValue;
  if (month === null || !isAnalyticsMonth(month)) {
    return {
      kind: "invalid",
      groupId: context.group.id,
      currentMonth: context.currentMonth,
      reason: "invalid_month",
    };
  }

  const [revisions, role, expenseCategories, monthly] = await Promise.all([
    loadBudgetRevisions(context.supabase, context.group.id),
    loadCurrentRole(context),
    loadExpenseCategories(context),
    listMonthlyTransactions(context.supabase, context.group.id, [month]),
  ]);

  // 予算実績はグループ支出を1取引につき1度だけ数え、収入と負担額を含めない (AC-BUD-004-1)
  const totals = aggregateAnalyticsMonth(
    month,
    monthly.expenses.map((expense) => ({
      date: expense.date,
      amountMinor: expense.amountMinor,
      payerMemberId: expense.payerMemberId,
      categoryId: expense.category.id,
      categoryName: expense.category.name,
      categoryColor: expense.category.color,
      allocations: expense.allocations,
    })),
    [],
    { scope: "group" },
  );

  const applied = resolveAppliedBudgetRevision(revisions, month);
  const revisionAtMonth = revisions.find(
    (revision) => revision.effectiveMonth === month,
  );

  return {
    kind: "ready",
    group: { id: context.group.id, name: context.group.name },
    month,
    previousMonth: shiftAnalyticsMonth(month, -1),
    nextMonth: shiftAnalyticsMonth(month, 1),
    currentMonth: context.currentMonth,
    canManage: role === "owner" || role === "admin",
    canEditMonth: isBudgetMonthEditable(month, context.currentMonth),
    progress: calculateBudgetProgress(applied, totals),
    appliedRevision: applied
      ? {
          effectiveMonth: applied.effectiveMonth,
          status: applied.status,
          version: applied.version,
        }
      : null,
    revisionAtMonth: revisionAtMonth
      ? { version: revisionAtMonth.version, status: revisionAtMonth.status }
      : null,
    history: revisions.map((revision) => ({
      effectiveMonth: revision.effectiveMonth,
      status: revision.status,
      totalAmountMinor: revision.totalAmountMinor,
    })),
    expenseCategories,
  };
}
