export type RecurringTransactionType = "expense" | "income";

export type RecurringAllocation = Readonly<{
  memberId: string;
  amountMinor: number;
}>;

export type RecurringSchedule = Readonly<{
  id: string;
  type: RecurringTransactionType;
  name: string;
  amountMinor: number;
  /** 毎月の日付（1〜28）。29日以降と月末は初回スコープ外 */
  dayOfMonth: number;
  /** `YYYY-MM` */
  startMonth: string;
  /** `YYYY-MM`。nullは無期限 */
  endMonth: string | null;
  category: Readonly<{ id: string; name: string; color: string; icon: string }>;
  payerMemberId: string | null;
  recipientMemberId: string | null;
  allocations: readonly RecurringAllocation[];
}>;

export type RecurringOccurrence = Readonly<{
  /** 実在する取引と混同しないよう、固定費IDと対象月から作る合成ID */
  occurrenceId: string;
  recurringTransactionId: string;
  type: RecurringTransactionType;
  name: string;
  /** `YYYY-MM-DD` */
  date: string;
  amountMinor: number;
  category: Readonly<{ id: string; name: string; color: string; icon: string }>;
  payerMemberId: string | null;
  recipientMemberId: string | null;
  allocations: readonly RecurringAllocation[];
}>;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// `YYYY-MM`として妥当かを判定する
export function isRecurringMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

// 対象月が開始月以降かつ終了月以内かを判定する（REC-006）
// `YYYY-MM`は固定長のため辞書順比較で時系列比較と一致する
export function isActiveInMonth(
  schedule: RecurringSchedule,
  month: string,
): boolean {
  if (!isRecurringMonth(month) || !isRecurringMonth(schedule.startMonth)) {
    return false;
  }
  if (schedule.endMonth !== null && !isRecurringMonth(schedule.endMonth)) {
    return false;
  }
  if (month < schedule.startMonth) return false;
  return schedule.endMonth === null || month <= schedule.endMonth;
}

// 対象月における展開日を`YYYY-MM-DD`で返す（1〜28日のため存在しない日付は生じない）
export function occurrenceDate(month: string, dayOfMonth: number): string {
  if (!isRecurringMonth(month)) throw new Error("invalid recurring month");
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
    throw new Error("invalid recurring day of month");
  }
  return `${month}-${String(dayOfMonth).padStart(2, "0")}`;
}

// 対象月へ有効な固定費を1件ずつ展開する。DBへ保存せず、同じ入力なら常に同じ結果を返す
export function expandRecurringForMonth(
  schedules: readonly RecurringSchedule[],
  month: string,
): readonly RecurringOccurrence[] {
  return schedules
    .filter((schedule) => isActiveInMonth(schedule, month))
    .map((schedule) => ({
      occurrenceId: `recurring:${schedule.id}:${month}`,
      recurringTransactionId: schedule.id,
      type: schedule.type,
      name: schedule.name,
      date: occurrenceDate(month, schedule.dayOfMonth),
      amountMinor: schedule.amountMinor,
      category: schedule.category,
      payerMemberId: schedule.payerMemberId,
      recipientMemberId: schedule.recipientMemberId,
      allocations: schedule.allocations,
    }));
}

// 一覧表示用に、対象月時点で終了済みかを判定する
export function isEndedAsOfMonth(
  schedule: RecurringSchedule,
  month: string,
): boolean {
  if (schedule.endMonth === null) return false;
  return schedule.endMonth < month;
}
