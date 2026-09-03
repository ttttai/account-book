import type { BudgetRevision } from "./budget-revision";

export type BudgetStatus = "ok" | "warn" | "over";

/** 色に依存せず状態を伝えるラベル (AC-BUD-007-1) */
export const BUDGET_STATUS_LABELS: Readonly<Record<BudgetStatus, string>> = {
  ok: "順調",
  warn: "注意",
  over: "超過",
};

export type BudgetCategoryProgress = Readonly<{
  categoryId: string;
  name: string;
  color: string;
  limitMinor: number;
  usedMinor: number;
  /** `予算額 − 実績`。超過時は負数 */
  remainingMinor: number;
  usedPercent: number;
  status: BudgetStatus;
}>;

export type BudgetProgress = Readonly<{
  /** 適用改定の開始月 `YYYY-MM` */
  effectiveMonth: string;
  version: number;
  limitMinor: number;
  usedMinor: number;
  remainingMinor: number;
  usedPercent: number;
  status: BudgetStatus;
  categories: readonly BudgetCategoryProgress[];
  /** グループ予算のうちカテゴリ予算へ配分していない金額 */
  unallocatedMinor: number;
}>;

/** 分析の月次集計から予算進捗の計算に必要な最小入力 (BUD-010) */
export type BudgetExpenseTotals = Readonly<{
  expenseTotal: number;
  expenseByCategory: readonly Readonly<{
    categoryId: string;
    amountMinor: number;
  }>[];
}>;

function assertSafeAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("invalid budget amount");
  }
}

// 80%未満・80%以上100%未満・100%以上を整数比較で判定する。表示用の四捨五入値を判定に使わない (AC-BUD-007-1)
// 上限近くの金額でも桁あふれしないようBigIntで比較する
export function budgetStatusOf(
  usedMinor: number,
  limitMinor: number,
): BudgetStatus {
  assertSafeAmount(usedMinor);
  assertSafeAmount(limitMinor);
  const used = BigInt(usedMinor);
  const limit = BigInt(limitMinor);
  if (used >= limit) return "over";
  // 80%未満は `実績 × 5 < 予算額 × 4`。tsconfigのtargetがES2017のためBigInt literalではなく関数呼び出しで作る
  if (used * BigInt(5) < limit * BigInt(4)) return "ok";
  return "warn";
}

// 消化率を整数パーセントへ四捨五入する表示値。100%超も切り詰めない (AC-BUD-007-2)
export function budgetUsedPercent(
  usedMinor: number,
  limitMinor: number,
): number {
  assertSafeAmount(usedMinor);
  assertSafeAmount(limitMinor);
  if (limitMinor <= 0) return 0;
  return Math.round((usedMinor / limitMinor) * 100);
}

function progressOf(
  limitMinor: number,
  usedMinor: number,
): Readonly<{
  remainingMinor: number;
  usedPercent: number;
  status: BudgetStatus;
}> {
  const remainingMinor = limitMinor - usedMinor;
  if (!Number.isSafeInteger(remainingMinor)) {
    throw new Error("invalid budget amount");
  }
  return {
    remainingMinor,
    usedPercent: budgetUsedPercent(usedMinor, limitMinor),
    status: budgetStatusOf(usedMinor, limitMinor),
  };
}

// 適用改定と同月のグループ支出から予算進捗を作る。予算画面と分析概要が共有する唯一の計算 (BUD-010)
// 停止改定・適用改定なしは予算未設定としてnullを返す (AC-BUD-006-1)
export function calculateBudgetProgress(
  revision: BudgetRevision | null,
  totals: BudgetExpenseTotals,
): BudgetProgress | null {
  if (revision?.status !== "active" || revision.totalAmountMinor === null) {
    return null;
  }
  const limitMinor = revision.totalAmountMinor;
  const usedMinor = totals.expenseTotal;
  assertSafeAmount(usedMinor);

  const usedByCategory = new Map<string, number>();
  for (const category of totals.expenseByCategory) {
    assertSafeAmount(category.amountMinor);
    const current = usedByCategory.get(category.categoryId) ?? 0;
    const next = current + category.amountMinor;
    if (!Number.isSafeInteger(next)) throw new Error("invalid budget amount");
    usedByCategory.set(category.categoryId, next);
  }

  let allocatedMinor = 0;
  // カテゴリ実績はカテゴリIDで突き合わせ、内訳に無いカテゴリの支出は総額にだけ含める (AC-BUD-004-2)
  const categories = revision.categoryLimits.map((limit) => {
    assertSafeAmount(limit.amountMinor);
    allocatedMinor += limit.amountMinor;
    if (!Number.isSafeInteger(allocatedMinor)) {
      throw new Error("invalid budget amount");
    }
    const categoryUsed = usedByCategory.get(limit.category.id) ?? 0;
    return {
      categoryId: limit.category.id,
      name: limit.category.name,
      color: limit.category.color,
      limitMinor: limit.amountMinor,
      usedMinor: categoryUsed,
      ...progressOf(limit.amountMinor, categoryUsed),
    } satisfies BudgetCategoryProgress;
  });

  return {
    effectiveMonth: revision.effectiveMonth,
    version: revision.version,
    limitMinor,
    usedMinor,
    ...progressOf(limitMinor, usedMinor),
    categories,
    unallocatedMinor: Math.max(limitMinor - allocatedMinor, 0),
  };
}
