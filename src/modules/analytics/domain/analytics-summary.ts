/** 集計対象。メンバー対象では負担額を支出として数える (CAL-010と同じ定義) */
export type AnalyticsTarget =
  | Readonly<{ scope: "group" }>
  | Readonly<{ scope: "member"; memberId: string }>;

export type AnalyticsAllocation = Readonly<{
  memberId: string;
  amountMinor: number;
}>;

export type AnalyticsExpenseInput = Readonly<{
  /** `YYYY-MM-DD` */
  date: string;
  amountMinor: number;
  payerMemberId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  allocations: readonly AnalyticsAllocation[];
}>;

export type AnalyticsIncomeInput = Readonly<{
  date: string;
  amountMinor: number;
  recipientMemberId: string;
}>;

export type AnalyticsCategoryTotal = Readonly<{
  categoryId: string;
  name: string;
  color: string;
  amountMinor: number;
}>;

export type AnalyticsMonthTotals = Readonly<{
  month: string;
  expenseTotal: number;
  incomeTotal: number;
  balance: number;
  expenseByCategory: readonly AnalyticsCategoryTotal[];
}>;

export type AnalyticsCategoryShare = AnalyticsCategoryTotal &
  Readonly<{ sharePercent: number }>;

export type AnalyticsCategoryBreakdown = Readonly<{
  top: readonly AnalyticsCategoryShare[];
  others?: Readonly<{
    amountMinor: number;
    categoryCount: number;
    sharePercent: number;
  }>;
}>;

export type AnalyticsComparison = Readonly<{
  diffMinor: number;
  /** 比較元が正のときだけ整数パーセント。0円以下ではnull (AC-ANA-003-1) */
  changePercent: number | null;
}>;

/** 概要分析で表示するカテゴリ件数 (ANA-004) */
export const ANALYTICS_CATEGORY_LIMIT = 5;

// 加算のたびに安全な整数範囲を検証し、金額の桁あふれを例外にする
export function safeAdd(left: number, right: number): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    right < 0
  ) {
    throw new Error("analytics amount overflow");
  }
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error("analytics amount overflow");
  }
  return result;
}

// 対象月・対象者の支出、収入、収支、カテゴリ別支出を集計する
// グループ対象は取引金額を1件につき1度だけ、メンバー対象は負担額だけを数える (AC-ANA-002-1)
export function aggregateAnalyticsMonth(
  month: string,
  expenses: readonly AnalyticsExpenseInput[],
  incomes: readonly AnalyticsIncomeInput[],
  target: AnalyticsTarget,
): AnalyticsMonthTotals {
  let expenseTotal = 0;
  let incomeTotal = 0;
  const categoryTotals = new Map<string, AnalyticsCategoryTotal>();

  for (const expense of expenses) {
    if (expense.date.slice(0, 7) !== month) continue;
    const targetAmount =
      target.scope === "group"
        ? expense.amountMinor
        : (expense.allocations.find(
            (allocation) => allocation.memberId === target.memberId,
          )?.amountMinor ?? 0);
    if (targetAmount <= 0) continue;

    expenseTotal = safeAdd(expenseTotal, targetAmount);
    const current = categoryTotals.get(expense.categoryId);
    categoryTotals.set(expense.categoryId, {
      categoryId: expense.categoryId,
      name: expense.categoryName,
      color: expense.categoryColor,
      amountMinor: safeAdd(current?.amountMinor ?? 0, targetAmount),
    });
  }

  // 収入は受取者一致だけを数え、支出とカテゴリ別支出へ混入させない (AC-ANA-010-1)
  for (const income of incomes) {
    if (income.date.slice(0, 7) !== month) continue;
    if (
      target.scope === "member" &&
      income.recipientMemberId !== target.memberId
    ) {
      continue;
    }
    incomeTotal = safeAdd(incomeTotal, income.amountMinor);
  }

  return {
    month,
    expenseTotal,
    incomeTotal,
    balance: incomeTotal - expenseTotal,
    expenseByCategory: [...categoryTotals.values()].sort(
      (left, right) =>
        right.amountMinor - left.amountMinor ||
        left.categoryId.localeCompare(right.categoryId),
    ),
  };
}

// 構成比を整数パーセントへ四捨五入する。期間支出0円では0%とし、無限大へ発散させない
export function sharePercentOf(
  amountMinor: number,
  expenseTotal: number,
): number {
  if (expenseTotal <= 0) return 0;
  return Math.round((amountMinor / expenseTotal) * 100);
}

// カテゴリ別支出を上位N件と「その他のカテゴリ」へ分ける
// 上位と残りの合計は常に期間支出と一致する (AC-ANA-004-1)
export function summarizeCategoryBreakdown(
  categories: readonly AnalyticsCategoryTotal[],
  expenseTotal: number,
  limit: number = ANALYTICS_CATEGORY_LIMIT,
): AnalyticsCategoryBreakdown {
  const top = categories.slice(0, limit).map((category) => ({
    ...category,
    sharePercent: sharePercentOf(category.amountMinor, expenseTotal),
  }));
  const rest = categories.slice(limit);
  if (rest.length === 0) return { top };

  const amountMinor = rest.reduce(
    (total, category) => safeAdd(total, category.amountMinor),
    0,
  );
  return {
    top,
    others: {
      amountMinor,
      categoryCount: rest.length,
      sharePercent: sharePercentOf(amountMinor, expenseTotal),
    },
  };
}

// 選択月と前月の差額を返す。比較元が正のときだけ前月比を付ける (AC-ANA-003-1、AC-ANA-003-2)
export function compareAnalyticsAmount(
  current: number,
  previous: number,
): AnalyticsComparison {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(previous)) {
    throw new Error("analytics amount overflow");
  }
  const diffMinor = current - previous;
  if (!Number.isSafeInteger(diffMinor)) {
    throw new Error("analytics amount overflow");
  }
  return {
    diffMinor,
    changePercent:
      previous > 0 ? Math.round((diffMinor / previous) * 100) : null,
  };
}
