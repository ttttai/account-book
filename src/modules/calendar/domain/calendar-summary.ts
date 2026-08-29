export type CalendarExpense = Readonly<{
  id: string;
  date: string;
  amountMinor: number;
  payerMemberId: string;
  createdAt: string;
  category: Readonly<{ name: string; color: string; icon: string }>;
  allocations: readonly Readonly<{ memberId: string; amountMinor: number }>[];
}>;

type CalendarSummaryTarget =
  | Readonly<{ scope: "group" }>
  | Readonly<{ scope: "member"; memberId: string }>;

export type CalendarSummary = Readonly<{
  monthlyTotal: number;
  monthlyPaidTotal?: number;
  dailyTotals: Readonly<Record<string, number>>;
}>;

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

// server renderとclient hydrationで同一文字列にするため、locale実装に依存しない
export function formatCalendarCellJpy(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("invalid JPY amount");
  }
  return String(amountMinor).replace(/\B(?=(\d{3})+$)/g, ",");
}

export function formatJpy(amountMinor: number): string {
  return `￥${formatCalendarCellJpy(amountMinor)}`;
}
