import "server-only";

import { z } from "zod";

import {
  type BudgetRevision,
  firstDayToMonth,
} from "../domain/budget-revision";

const safeAmountSchema = z.union([
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
]);

// `budget_revisions`のselect結果。内訳とそのカテゴリをembedして1回で取得する
export const budgetRevisionRowSchema = z.object({
  id: z.uuid(),
  effective_month: z.string(),
  status: z.enum(["active", "disabled"]),
  total_amount_minor: safeAmountSchema.nullable(),
  version: z.number().int().min(1),
  budget_category_limits: z.array(
    z.object({
      category_id: z.uuid(),
      amount_minor: safeAmountSchema,
      categories: z.object({
        id: z.uuid(),
        name: z.string(),
        color: z.string(),
      }),
    }),
  ),
});

export type BudgetRevisionRow = z.infer<typeof budgetRevisionRowSchema>;

// DB行を、適用判定と進捗計算に使うドメイン型（月は`YYYY-MM`）へ変換する
export function toBudgetRevision(row: BudgetRevisionRow): BudgetRevision {
  return {
    id: row.id,
    effectiveMonth: firstDayToMonth(row.effective_month),
    status: row.status,
    totalAmountMinor: row.total_amount_minor,
    version: row.version,
    categoryLimits: row.budget_category_limits.map((limit) => ({
      category: {
        id: limit.categories.id,
        name: limit.categories.name,
        color: limit.categories.color,
      },
      amountMinor: limit.amount_minor,
    })),
  };
}

// 取得列は行検証schemaと対で管理し、画面ごとの書き分けで列が欠けるのを防ぐ
export const BUDGET_REVISION_SELECT_COLUMNS =
  "id, effective_month, status, total_amount_minor, version, budget_category_limits!budget_category_limits_revision_group_fk(category_id, amount_minor, categories!budget_category_limits_category_group_fk(id, name, color))";
