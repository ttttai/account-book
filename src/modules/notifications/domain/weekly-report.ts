import {
  aggregateAnalyticsDateRange,
  aggregateAnalyticsMonth,
  type AnalyticsCategoryBreakdown,
  type AnalyticsComparison,
  compareAnalyticsAmount,
  formatAnalyticsJpy,
  formatAnalyticsSignedJpy,
  summarizeCategoryBreakdown,
} from "@/modules/analytics";
import {
  BUDGET_STATUS_LABELS,
  type BudgetProgress,
  calculateBudgetProgress,
} from "@/modules/budgets";

import type { ReportDateRange, WeeklyReportPeriod } from "./report-period";
import {
  toAnalyticsInputs,
  toBudgetRevision,
  type WeeklyReportSource,
} from "./report-source";

export type WeeklyReport = Readonly<{
  groupName: string;
  week: Readonly<{
    range: ReportDateRange;
    expenseTotal: number;
    expenseCount: number;
    comparison: AnalyticsComparison;
    breakdown: AnalyticsCategoryBreakdown;
  }>;
  month: Readonly<{
    month: string;
    expenseTotal: number;
    incomeTotal: number;
    balance: number;
  }>;
  /** 対象月に有効な予算がある場合だけ持つ */
  budget: BudgetProgress | null;
}>;

const GROUP_TARGET = { scope: "group" } as const;

// 対象週・対象月・予算進捗を、画面と同じ分析・予算の純関数で組み立てる (NOTIF-003)
export function buildWeeklyReport(
  groupName: string,
  period: WeeklyReportPeriod,
  source: WeeklyReportSource,
): WeeklyReport {
  const inputs = toAnalyticsInputs(source, period.months);

  const week = aggregateAnalyticsDateRange(
    period.week,
    inputs.expenses,
    inputs.incomes,
    GROUP_TARGET,
  );
  const previousWeek = aggregateAnalyticsDateRange(
    period.previousWeek,
    inputs.expenses,
    inputs.incomes,
    GROUP_TARGET,
  );
  const month = aggregateAnalyticsMonth(
    period.month,
    inputs.expenses,
    inputs.incomes,
    GROUP_TARGET,
  );

  // 予算実績は予算画面・概要分析と同じ月合計を渡す (AC-NOTIF-003-2)
  const budget = calculateBudgetProgress(toBudgetRevision(source.budget), {
    expenseTotal: month.expenseTotal,
    expenseByCategory: month.expenseByCategory.map((category) => ({
      categoryId: category.categoryId,
      amountMinor: category.amountMinor,
    })),
  });

  return {
    groupName,
    week: {
      range: period.week,
      expenseTotal: week.expenseTotal,
      expenseCount: week.expenseCount,
      comparison: compareAnalyticsAmount(
        week.expenseTotal,
        previousWeek.expenseTotal,
      ),
      breakdown: summarizeCategoryBreakdown(
        week.expenseByCategory,
        week.expenseTotal,
      ),
    },
    month: {
      month: period.month,
      expenseTotal: month.expenseTotal,
      incomeTotal: month.incomeTotal,
      balance: month.balance,
    },
    budget,
  };
}

// `YYYY-MM-DD`を表示用の`M/D`にする
function formatDisplayDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}`;
}

// `YYYY-MM`を表示用の`M月`にする
function formatDisplayMonth(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

function weekLines(week: WeeklyReport["week"]): readonly string[] {
  if (week.expenseCount === 0) {
    return ["今週の支出登録はありませんでした。"];
  }
  // 先週比は符号付きの差額だけを示し、比率は算出しない (ANA-003と同じ規則)
  const lines = [
    `支出 ${formatAnalyticsJpy(week.expenseTotal)}（${week.expenseCount}件）`,
    `先週比 ${formatAnalyticsSignedJpy(week.comparison.diffMinor)}`,
    ...week.breakdown.top.map(
      (category) =>
        `・${category.name} ${formatAnalyticsJpy(category.amountMinor)}`,
    ),
  ];
  if (week.breakdown.others) {
    lines.push(
      `・その他のカテゴリ ${formatAnalyticsJpy(week.breakdown.others.amountMinor)}（${week.breakdown.others.categoryCount}件）`,
    );
  }
  return lines;
}

function budgetLines(month: string, budget: BudgetProgress): readonly string[] {
  // 残額は超過時に「超過 ￥x」と明示する (BUD-007と同じ表記)
  const remaining =
    budget.remainingMinor < 0
      ? `超過 ${formatAnalyticsJpy(-budget.remainingMinor)}`
      : `残り ${formatAnalyticsJpy(budget.remainingMinor)}`;
  return [
    `■ ${formatDisplayMonth(month)}の予算 ${formatAnalyticsJpy(budget.limitMinor)}`,
    `消化 ${budget.usedPercent}%・${remaining}・${BUDGET_STATUS_LABELS[budget.status]}`,
    // 順調のカテゴリは省き、注意・超過だけを知らせる
    ...budget.categories
      .filter((category) => category.status !== "ok")
      .map(
        (category) =>
          `・${category.name} ${BUDGET_STATUS_LABELS[category.status]}（${category.usedPercent}%）`,
      ),
  ];
}

// 週次レポートのテキスト本文を組み立てる (NOTIF-002, AC-NOTIF-002-1)
export function formatWeeklyReportMessage(report: WeeklyReport): string {
  const lines = [
    `【${report.groupName}】今週のまとめ（${formatDisplayDate(report.week.range.start)}〜${formatDisplayDate(report.week.range.end)}）`,
    ...weekLines(report.week),
    "",
    `■ ${formatDisplayMonth(report.month.month)}の実績`,
    `支出 ${formatAnalyticsJpy(report.month.expenseTotal)} / 収入 ${formatAnalyticsJpy(report.month.incomeTotal)} / 収支 ${formatAnalyticsSignedJpy(report.month.balance)}`,
  ];
  if (report.budget) {
    lines.push("", ...budgetLines(report.month.month, report.budget));
  }
  return lines.join("\n");
}
