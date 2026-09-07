import type {
  AnalyticsExpenseInput,
  AnalyticsIncomeInput,
} from "@/modules/analytics";
import type { BudgetRevision } from "@/modules/budgets";
import {
  expandRecurringForMonth,
  type RecurringSchedule,
} from "@/modules/recurring";

/** 負担額。メンバー対象の集計に使う (CAL-010) */
export type ReportAllocationRow = Readonly<{
  memberId: string;
  amountMinor: number;
}>;

/** 通知用DB関数が返す支出行。メモ・取引の名称を持たない (NOTIF-007) */
export type ReportExpenseRow = Readonly<{
  date: string;
  amountMinor: number;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  payerMemberId: string | null;
  allocations: readonly ReportAllocationRow[];
}>;

export type ReportIncomeRow = Readonly<{
  date: string;
  amountMinor: number;
}>;

/** 固定費の展開に必要な条件と負担額だけを持つ行 */
export type ReportRecurringRow = Readonly<{
  id: string;
  type: "expense" | "income";
  amountMinor: number;
  dayOfMonth: number;
  /** `YYYY-MM` */
  startMonth: string;
  /** `YYYY-MM`。nullは無期限 */
  endMonth: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  payerMemberId: string | null;
  allocations: readonly ReportAllocationRow[];
}>;

export type ReportBudgetRevisionRow = Readonly<{
  /** `YYYY-MM` */
  effectiveMonth: string;
  status: "active" | "disabled";
  totalAmountMinor: number | null;
  version: number;
  categoryLimits: readonly Readonly<{
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    amountMinor: number;
  }>[];
}>;

/** アクティブメンバー。表示名はプロフィールの表示名 (D-013) */
export type ReportMemberRow = Readonly<{
  id: string;
  displayName: string;
}>;

export type WeeklyReportSource = Readonly<{
  expenses: readonly ReportExpenseRow[];
  incomes: readonly ReportIncomeRow[];
  recurring: readonly ReportRecurringRow[];
  /** 対象月の適用改定。適用改定がなければnull */
  budget: ReportBudgetRevisionRow | null;
  members: readonly ReportMemberRow[];
}>;

export type ReportAnalyticsInputs = Readonly<{
  /** 単発取引と固定費の展開結果を合わせた支出 */
  expenses: readonly AnalyticsExpenseInput[];
  incomes: readonly AnalyticsIncomeInput[];
  /** `expenses`のうち固定費の展開結果。月末の見込みで変動費と区別する (NOTIF-003) */
  recurringExpenses: readonly AnalyticsExpenseInput[];
}>;

// 受取者は通知で使わないため空のまま渡す
const NO_MEMBER = "";

// 固定費の展開純関数へ渡すため、通知用の行を展開条件と負担額だけ持つ設定へ変換する
function toRecurringSchedule(row: ReportRecurringRow): RecurringSchedule {
  return {
    id: row.id,
    type: row.type,
    name: "",
    amountMinor: row.amountMinor,
    dayOfMonth: row.dayOfMonth,
    startMonth: row.startMonth,
    endMonth: row.endMonth,
    category: {
      id: row.categoryId,
      name: row.categoryName,
      color: row.categoryColor,
      icon: "",
    },
    payerMemberId: row.payerMemberId,
    recipientMemberId: null,
    allocations: row.allocations,
  };
}

// 単発取引と各月へ展開した固定費を、分析モジュールの集計入力へ変換する (AC-NOTIF-003-1)
// 展開はカレンダー・分析と同じ`expandRecurringForMonth`で行い、通知側で日付規則を持たない
export function toAnalyticsInputs(
  source: WeeklyReportSource,
  months: readonly string[],
): ReportAnalyticsInputs {
  const expenses: AnalyticsExpenseInput[] = source.expenses.map((row) => ({
    date: row.date,
    amountMinor: row.amountMinor,
    payerMemberId: row.payerMemberId ?? NO_MEMBER,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categoryColor: row.categoryColor,
    allocations: row.allocations,
  }));
  const incomes: AnalyticsIncomeInput[] = source.incomes.map((row) => ({
    date: row.date,
    amountMinor: row.amountMinor,
    recipientMemberId: NO_MEMBER,
  }));
  const recurringExpenses: AnalyticsExpenseInput[] = [];

  const schedules = source.recurring.map(toRecurringSchedule);
  for (const month of months) {
    for (const occurrence of expandRecurringForMonth(schedules, month)) {
      if (occurrence.type === "expense") {
        const expense: AnalyticsExpenseInput = {
          date: occurrence.date,
          amountMinor: occurrence.amountMinor,
          payerMemberId: occurrence.payerMemberId ?? NO_MEMBER,
          categoryId: occurrence.category.id,
          categoryName: occurrence.category.name,
          categoryColor: occurrence.category.color,
          allocations: occurrence.allocations,
        };
        expenses.push(expense);
        recurringExpenses.push(expense);
        continue;
      }
      incomes.push({
        date: occurrence.date,
        amountMinor: occurrence.amountMinor,
        recipientMemberId: NO_MEMBER,
      });
    }
  }

  return { expenses, incomes, recurringExpenses };
}

// 通知用の適用改定を、予算モジュールの進捗計算が受け取る改定型へ変換する (AC-NOTIF-003-2)
export function toBudgetRevision(
  row: ReportBudgetRevisionRow | null,
): BudgetRevision | null {
  if (!row) return null;
  return {
    // 進捗計算は改定IDを使わないため、月から作る合成IDで足りる
    id: `line-report:${row.effectiveMonth}`,
    effectiveMonth: row.effectiveMonth,
    status: row.status,
    totalAmountMinor: row.totalAmountMinor,
    version: row.version,
    categoryLimits: row.categoryLimits.map((limit) => ({
      category: {
        id: limit.categoryId,
        name: limit.categoryName,
        color: limit.categoryColor,
      },
      amountMinor: limit.amountMinor,
    })),
  };
}
