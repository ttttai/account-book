import {
  aggregateAnalyticsDateRange,
  aggregateAnalyticsMonth,
  type AnalyticsCategoryTotal,
  type AnalyticsComparison,
  type AnalyticsExpenseInput,
  type AnalyticsIncomeInput,
  compareAnalyticsAmount,
  formatAnalyticsJpy,
  formatAnalyticsSignedJpy,
  sharePercentOf,
  summarizeCategoryBreakdown,
} from "@/modules/analytics";
import {
  BUDGET_STATUS_LABELS,
  type BudgetProgress,
  calculateBudgetProgress,
} from "@/modules/budgets";

import type { ReportDateRange, WeeklyReportPeriod } from "./report-period";
import {
  type ReportMemberRow,
  toAnalyticsInputs,
  toBudgetRevision,
  type WeeklyReportSource,
} from "./report-source";

export type WeeklyReportCategoryLine = Readonly<{
  name: string;
  amountMinor: number;
  /** 前週の同じカテゴリとの差額 */
  diffMinor: number;
}>;

export type WeeklyReportMemberLine = Readonly<{
  displayName: string;
  /** 負担額 (CAL-010) */
  amountMinor: number;
  /** グループ支出に対する構成比（整数パーセント） */
  sharePercent: number;
}>;

export type WeeklyReport = Readonly<{
  groupName: string;
  week: Readonly<{
    range: ReportDateRange;
    expenseTotal: number;
    expenseCount: number;
    comparison: AnalyticsComparison;
    categories: readonly WeeklyReportCategoryLine[];
    /** 上位5件に入らないカテゴリの合算。無ければnull */
    others: Readonly<{
      amountMinor: number;
      diffMinor: number;
      categoryCount: number;
    }> | null;
    members: readonly WeeklyReportMemberLine[];
  }>;
  month: Readonly<{
    month: string;
    elapsedDays: number;
    daysInMonth: number;
    expenseTotal: number;
    incomeTotal: number;
    balance: number;
    previousMonthToDateExpenseTotal: number;
    /** 累計支出と先月の同時点との差額 */
    comparison: AnalyticsComparison;
    forecastExpenseTotal: number;
    members: readonly WeeklyReportMemberLine[];
  }>;
  /** 対象月に有効な予算がある場合だけ持つ */
  budget: Readonly<{
    progress: BudgetProgress;
    /** 残額を残り日数で割った額。残額0円以下または残り日数0日ではnull */
    dailyAllowanceMinor: number | null;
    forecastWithinLimit: boolean;
  }> | null;
}>;

export type MonthEndEstimateInput = Readonly<{
  monthToDateTotal: number;
  /** 累計のうち単発取引（変動費）の合計 */
  variableToDate: number;
  /** 対象月の固定費のうち、累計の終端より後に展開されるものの合計 */
  recurringRemaining: number;
  elapsedDays: number;
  daysInMonth: number;
}>;

const GROUP_TARGET = { scope: "group" } as const;
const USAGE_BAR_LENGTH = 10;

function assertSafeAmount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("invalid report amount");
  }
  return value;
}

function sumAmounts(items: readonly { amountMinor: number }[]): number {
  return items.reduce(
    (total, item) =>
      assertSafeAmount(total + assertSafeAmount(item.amountMinor)),
    0,
  );
}

// 月末の見込み: 累計支出 ＋ 変動費の日割り（四捨五入、整数演算） ＋ 未到来の固定費 (NOTIF-003, AC-NOTIF-003-3)
export function estimateMonthEndExpense(input: MonthEndEstimateInput): number {
  const remainingDays = input.daysInMonth - input.elapsedDays;
  if (remainingDays <= 0 || input.elapsedDays <= 0) {
    return input.monthToDateTotal;
  }
  const scaled = assertSafeAmount(input.variableToDate * remainingDays);
  // 剰余で商を求め、余りが半分以上なら切り上げる（浮動小数点を金額に使わない）
  const remainder = scaled % input.elapsedDays;
  let projected = (scaled - remainder) / input.elapsedDays;
  if (remainder * 2 >= input.elapsedDays) projected += 1;
  return assertSafeAmount(
    input.monthToDateTotal + projected + input.recurringRemaining,
  );
}

// 消化率を10段階の文字バーにする。10%ごとに1つ塗り、100%以上は全部塗る (AC-NOTIF-002-3)
export function formatUsageBar(usedPercent: number): string {
  const filled = Math.min(
    USAGE_BAR_LENGTH,
    Math.max(0, Math.floor(usedPercent / 10)),
  );
  return "█".repeat(filled) + "░".repeat(USAGE_BAR_LENGTH - filled);
}

function inRange(date: string, range: ReportDateRange): boolean {
  return date >= range.start && date <= range.end;
}

// 各アクティブメンバーの負担額を、分析のメンバー対象で求めて金額降順・同額は表示名順に並べる
function memberLines(
  range: ReportDateRange,
  inputs: Readonly<{
    expenses: readonly AnalyticsExpenseInput[];
    incomes: readonly AnalyticsIncomeInput[];
  }>,
  members: readonly ReportMemberRow[],
  groupTotal: number,
): readonly WeeklyReportMemberLine[] {
  return members
    .map((member) => {
      const totals = aggregateAnalyticsDateRange(
        range,
        inputs.expenses,
        inputs.incomes,
        { scope: "member", memberId: member.id },
      );
      return {
        displayName: member.displayName,
        amountMinor: totals.expenseTotal,
        sharePercent: sharePercentOf(totals.expenseTotal, groupTotal),
      };
    })
    .sort(
      (left, right) =>
        right.amountMinor - left.amountMinor ||
        left.displayName.localeCompare(right.displayName, "ja"),
    );
}

// カテゴリ行に前週の同じカテゴリとの差額を付ける
function categoryLines(
  current: readonly AnalyticsCategoryTotal[],
  previous: readonly AnalyticsCategoryTotal[],
  expenseTotal: number,
): Pick<WeeklyReport["week"], "categories" | "others"> {
  const previousByCategory = new Map(
    previous.map((category) => [category.categoryId, category.amountMinor]),
  );
  const breakdown = summarizeCategoryBreakdown(current, expenseTotal);
  const categories = breakdown.top.map((category) => ({
    name: category.name,
    amountMinor: category.amountMinor,
    diffMinor:
      category.amountMinor - (previousByCategory.get(category.categoryId) ?? 0),
  }));
  if (!breakdown.others) return { categories, others: null };

  const rest = current.slice(breakdown.top.length);
  const previousRest = rest.reduce(
    (total, category) =>
      total + (previousByCategory.get(category.categoryId) ?? 0),
    0,
  );
  return {
    categories,
    others: {
      amountMinor: breakdown.others.amountMinor,
      diffMinor: breakdown.others.amountMinor - previousRest,
      categoryCount: breakdown.others.categoryCount,
    },
  };
}

// 対象週・メンバー別・累計・先月の同時点・月末の見込み・予算進捗を、画面と同じ分析・予算の純関数で組み立てる (NOTIF-003)
export function buildWeeklyReport(
  groupName: string,
  period: WeeklyReportPeriod,
  source: WeeklyReportSource,
): WeeklyReport {
  const inputs = toAnalyticsInputs(source, period.months);
  const aggregate = (range: ReportDateRange) =>
    aggregateAnalyticsDateRange(
      range,
      inputs.expenses,
      inputs.incomes,
      GROUP_TARGET,
    );

  const week = aggregate(period.week);
  const previousWeek = aggregate(period.previousWeek);
  const monthToDate = aggregate(period.monthToDate);
  const previousMonthToDate = aggregate(period.previousMonthToDate);
  // 予算実績は予算画面・概要分析と同じ対象月全体の集計を渡す (AC-NOTIF-003-2)
  const wholeMonth = aggregateAnalyticsMonth(
    period.month,
    inputs.expenses,
    inputs.incomes,
    GROUP_TARGET,
  );

  const recurringToDate = sumAmounts(
    inputs.recurringExpenses.filter((expense) =>
      inRange(expense.date, period.monthToDate),
    ),
  );
  const recurringRemaining = sumAmounts(
    inputs.recurringExpenses.filter(
      (expense) =>
        expense.date.slice(0, 7) === period.month &&
        expense.date > period.monthToDate.end,
    ),
  );
  const forecastExpenseTotal = estimateMonthEndExpense({
    monthToDateTotal: monthToDate.expenseTotal,
    variableToDate: monthToDate.expenseTotal - recurringToDate,
    recurringRemaining,
    elapsedDays: period.elapsedDays,
    daysInMonth: period.daysInMonth,
  });

  const progress = calculateBudgetProgress(toBudgetRevision(source.budget), {
    expenseTotal: wholeMonth.expenseTotal,
    expenseByCategory: wholeMonth.expenseByCategory.map((category) => ({
      categoryId: category.categoryId,
      amountMinor: category.amountMinor,
    })),
  });
  const remainingDays = period.daysInMonth - period.elapsedDays;

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
      ...categoryLines(
        week.expenseByCategory,
        previousWeek.expenseByCategory,
        week.expenseTotal,
      ),
      members: memberLines(
        period.week,
        inputs,
        source.members,
        week.expenseTotal,
      ),
    },
    month: {
      month: period.month,
      elapsedDays: period.elapsedDays,
      daysInMonth: period.daysInMonth,
      expenseTotal: monthToDate.expenseTotal,
      incomeTotal: monthToDate.incomeTotal,
      balance: monthToDate.balance,
      previousMonthToDateExpenseTotal: previousMonthToDate.expenseTotal,
      comparison: compareAnalyticsAmount(
        monthToDate.expenseTotal,
        previousMonthToDate.expenseTotal,
      ),
      forecastExpenseTotal,
      members: memberLines(
        period.monthToDate,
        inputs,
        source.members,
        monthToDate.expenseTotal,
      ),
    },
    budget: progress
      ? {
          progress,
          dailyAllowanceMinor:
            remainingDays > 0 && progress.remainingMinor > 0
              ? Math.floor(progress.remainingMinor / remainingDays)
              : null,
          forecastWithinLimit: forecastExpenseTotal <= progress.limitMinor,
        }
      : null,
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
    `支出 ${formatAnalyticsJpy(week.expenseTotal)}（先週比 ${formatAnalyticsSignedJpy(week.comparison.diffMinor)}）`,
    ...week.categories.map(
      (category) =>
        `・${category.name} ${formatAnalyticsJpy(category.amountMinor)}（${formatAnalyticsSignedJpy(category.diffMinor)}）`,
    ),
  ];
  if (week.others) {
    lines.push(
      `・その他のカテゴリ ${formatAnalyticsJpy(week.others.amountMinor)}（${formatAnalyticsSignedJpy(week.others.diffMinor)}）`,
    );
  }
  return lines;
}

function memberSectionLines(
  title: string,
  members: readonly WeeklyReportMemberLine[],
  withShare: boolean,
): readonly string[] {
  return [
    "",
    title,
    ...members.map((member) =>
      withShare
        ? `・${member.displayName} ${formatAnalyticsJpy(member.amountMinor)}（${member.sharePercent}%）`
        : `・${member.displayName} ${formatAnalyticsJpy(member.amountMinor)}`,
    ),
  ];
}

function budgetLines(
  month: string,
  budget: NonNullable<WeeklyReport["budget"]>,
): readonly string[] {
  const { progress } = budget;
  // 残額は超過時に「超過 ￥x」と明示する (BUD-007と同じ表記)
  const remaining =
    progress.remainingMinor < 0
      ? `超過 ${formatAnalyticsJpy(-progress.remainingMinor)}`
      : `残り ${formatAnalyticsJpy(progress.remainingMinor)}`;
  const lines = [
    "",
    `🎯 ${formatDisplayMonth(month)}の予算 ${formatAnalyticsJpy(progress.limitMinor)}`,
    `${formatUsageBar(progress.usedPercent)} ${progress.usedPercent}%・${remaining}`,
  ];
  if (budget.dailyAllowanceMinor !== null) {
    lines.push(
      `1日あたり ${formatAnalyticsJpy(budget.dailyAllowanceMinor)} 使えます`,
    );
  }
  lines.push(
    budget.forecastWithinLimit ? "見込みは予算内" : "見込みは予算超過",
  );
  // 順調のカテゴリは省き、注意・超過だけを知らせる
  for (const category of progress.categories) {
    if (category.status === "ok") continue;
    lines.push(
      `⚠ ${category.name} ${BUDGET_STATUS_LABELS[category.status]}（${category.usedPercent}%）`,
    );
  }
  return lines;
}

// 週次サマリーのテキスト本文を組み立てる (NOTIF-002, AC-NOTIF-002-1)
export function formatWeeklyReportMessage(report: WeeklyReport): string {
  const { week, month } = report;
  const lines = [
    `【${report.groupName}】週次サマリー`,
    `📅 今週（${formatDisplayDate(week.range.start)}〜${formatDisplayDate(week.range.end)}）`,
    ...weekLines(week),
  ];
  // 0件の週はメンバーの支出を省く
  if (week.expenseCount > 0 && week.members.length > 0) {
    lines.push(...memberSectionLines("メンバーの支出", week.members, true));
  }
  lines.push(
    "",
    `📆 ${formatDisplayMonth(month.month)}の累計（${month.elapsedDays}日経過）`,
    `支出 ${formatAnalyticsJpy(month.expenseTotal)}`,
    `収入 ${formatAnalyticsJpy(month.incomeTotal)}`,
    `収支 ${formatAnalyticsSignedJpy(month.balance)}`,
    `先月の同時点 ${formatAnalyticsJpy(month.previousMonthToDateExpenseTotal)}（先月比 ${formatAnalyticsSignedJpy(month.comparison.diffMinor)}）`,
    `月末の見込み ${formatAnalyticsJpy(month.forecastExpenseTotal)}`,
  );
  if (month.members.length > 0) {
    lines.push(
      ...memberSectionLines("メンバーの累計支出", month.members, false),
    );
  }
  if (report.budget) {
    lines.push(...budgetLines(month.month, report.budget));
  }
  return lines.join("\n");
}
