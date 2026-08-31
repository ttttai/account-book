export type CalendarExpense = Readonly<{
  id: string;
  date: string;
  amountMinor: number;
  payerMemberId: string;
  createdAt: string;
  category: Readonly<{ name: string; color: string; icon: string }>;
  allocations: readonly Readonly<{ memberId: string; amountMinor: number }>[];
  /** 定期取引の展開結果のときだけtrue。集計規則は単発取引と同じ (REC-005) */
  isRecurring?: boolean;
  recurringName?: string;
}>;

export type CalendarIncome = Readonly<{
  id: string;
  date: string;
  amountMinor: number;
  recipientMemberId: string;
  createdAt: string;
  category: Readonly<{ name: string; color: string; icon: string }>;
  /** 定期取引の展開結果のときだけtrue */
  isRecurring?: boolean;
  recurringName?: string;
}>;

type CalendarSummaryTarget =
  | Readonly<{ scope: "group" }>
  | Readonly<{ scope: "member"; memberId: string }>;

export type CalendarSummary = Readonly<{
  monthlyTotal: number;
  monthlyPaidTotal?: number;
  dailyTotals: Readonly<Record<string, number>>;
}>;

// 加算のたびに安全な整数範囲を検証し、金額の桁あふれを例外にする
function safeAdd(left: number, right: number): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    right < 0
  ) {
    throw new Error("calendar amount overflow");
  }
  const result = left + right;
  if (!Number.isSafeInteger(result))
    throw new Error("calendar amount overflow");
  return result;
}

// 対象（グループ全体または特定メンバーの負担額）で月間合計と日別合計を集計する
export function calculateCalendarSummary(
  expenses: readonly CalendarExpense[],
  target: CalendarSummaryTarget,
): CalendarSummary {
  let monthlyTotal = 0;
  let monthlyPaidTotal = 0;
  const dailyTotals: Record<string, number> = {};

  for (const expense of expenses) {
    const targetAmount =
      target.scope === "group"
        ? expense.amountMinor
        : (expense.allocations.find(
            (allocation) => allocation.memberId === target.memberId,
          )?.amountMinor ?? 0);

    if (targetAmount > 0) {
      monthlyTotal = safeAdd(monthlyTotal, targetAmount);
      dailyTotals[expense.date] = safeAdd(
        dailyTotals[expense.date] ?? 0,
        targetAmount,
      );
    }

    if (
      target.scope === "member" &&
      expense.payerMemberId === target.memberId
    ) {
      monthlyPaidTotal = safeAdd(monthlyPaidTotal, expense.amountMinor);
    }
  }

  return {
    monthlyTotal,
    ...(target.scope === "member" ? { monthlyPaidTotal } : {}),
    dailyTotals,
  };
}

export type CalendarIncomeSummary = Readonly<{
  monthlyIncomeTotal: number;
  incomeDailyTotals: Readonly<Record<string, number>>;
}>;

// 対象（グループ全体または受取者が特定メンバー）の月間・日別の収入を集計する (AC-CAL-012-2)
// 支出とは別に集計し、純額を作らない (CAL-009、CAL-012)
export function calculateCalendarIncomeSummary(
  incomes: readonly CalendarIncome[],
  target: CalendarSummaryTarget,
): CalendarIncomeSummary {
  let monthlyIncomeTotal = 0;
  const incomeDailyTotals: Record<string, number> = {};

  for (const income of incomes) {
    if (
      target.scope === "member" &&
      income.recipientMemberId !== target.memberId
    ) {
      continue;
    }
    monthlyIncomeTotal = safeAdd(monthlyIncomeTotal, income.amountMinor);
    incomeDailyTotals[income.date] = safeAdd(
      incomeDailyTotals[income.date] ?? 0,
      income.amountMinor,
    );
  }

  return { monthlyIncomeTotal, incomeDailyTotals };
}

// 金額を3桁区切りの数字文字列にする
// server renderとclient hydrationで同一文字列にするため、locale実装に依存しない
export function formatCalendarCellJpy(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("invalid JPY amount");
  }
  return String(amountMinor).replace(/\B(?=(\d{3})+$)/g, ",");
}

// 円記号付きの表示用金額文字列にする
export function formatJpy(amountMinor: number): string {
  return `￥${formatCalendarCellJpy(amountMinor)}`;
}
