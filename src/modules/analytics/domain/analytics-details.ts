import type {
  AnalyticsCategoryShare,
  AnalyticsExpenseInput,
  AnalyticsIncomeInput,
  AnalyticsMonthTotals,
} from "./analytics-summary";
import { safeAdd, sharePercentOf } from "./analytics-summary";

export type AnalyticsPeriodTotals = Readonly<{
  expenseTotal: number;
  incomeTotal: number;
  balance: number;
  averageExpense: number;
  highestExpenseMonth: string | null;
  expenseByCategory: readonly AnalyticsCategoryShare[];
}>;

export type AnalyticsMemberTotal = Readonly<{
  membershipId: string;
  displayName: string;
  usageTotal: number;
  paidTotal: number;
  receivedTotal: number;
}>;

// 月別DTOから期間合計、月平均、最大支出月、カテゴリ構成を導く (ANA-008)
export function summarizeAnalyticsPeriod(
  months: readonly AnalyticsMonthTotals[],
): AnalyticsPeriodTotals {
  let expenseTotal = 0;
  let incomeTotal = 0;
  let highestExpenseMonth: string | null = null;
  let highestExpense = 0;
  const categories = new Map<
    string,
    Omit<AnalyticsCategoryShare, "sharePercent">
  >();

  for (const month of months) {
    expenseTotal = safeAdd(expenseTotal, month.expenseTotal);
    incomeTotal = safeAdd(incomeTotal, month.incomeTotal);
    if (month.expenseTotal > 0 && month.expenseTotal >= highestExpense) {
      highestExpense = month.expenseTotal;
      highestExpenseMonth = month.month;
    }
    for (const category of month.expenseByCategory) {
      const current = categories.get(category.categoryId);
      categories.set(category.categoryId, {
        categoryId: category.categoryId,
        name: category.name,
        color: category.color,
        amountMinor: safeAdd(current?.amountMinor ?? 0, category.amountMinor),
      });
    }
  }

  const expenseByCategory = [...categories.values()]
    .sort(
      (left, right) =>
        right.amountMinor - left.amountMinor ||
        left.categoryId.localeCompare(right.categoryId),
    )
    .map((category) => ({
      ...category,
      sharePercent: sharePercentOf(category.amountMinor, expenseTotal),
    }));

  return {
    expenseTotal,
    incomeTotal,
    balance: incomeTotal - expenseTotal,
    averageExpense:
      months.length === 0 ? 0 : Math.round(expenseTotal / months.length),
    highestExpenseMonth,
    expenseByCategory,
  };
}

// 同じ認可済み取引集合から負担額・支払額・受取額を別系列で集計する
export function aggregateAnalyticsMembers(
  members: readonly Readonly<{
    membershipId: string;
    displayName: string;
  }>[],
  expenses: readonly AnalyticsExpenseInput[],
  incomes: readonly AnalyticsIncomeInput[],
): readonly AnalyticsMemberTotal[] {
  return members.map((member) => {
    let usageTotal = 0;
    let paidTotal = 0;
    let receivedTotal = 0;
    for (const expense of expenses) {
      const allocation = expense.allocations.find(
        (item) => item.memberId === member.membershipId,
      );
      if (allocation) usageTotal = safeAdd(usageTotal, allocation.amountMinor);
      if (expense.payerMemberId === member.membershipId) {
        paidTotal = safeAdd(paidTotal, expense.amountMinor);
      }
    }
    for (const income of incomes) {
      if (income.recipientMemberId === member.membershipId) {
        receivedTotal = safeAdd(receivedTotal, income.amountMinor);
      }
    }
    return {
      membershipId: member.membershipId,
      displayName: member.displayName,
      usageTotal,
      paidTotal,
      receivedTotal,
    };
  });
}
