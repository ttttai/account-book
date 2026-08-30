import type { CalendarGridCell } from "../domain/calendar-grid";
import type { CalendarScope } from "../domain/calendar-input";

export type CalendarMember = Readonly<{
  membershipId: string;
  displayName: string;
  isCurrentUser: boolean;
}>;

export type CalendarAllocationDetail = Readonly<{
  membershipId: string;
  displayName: string;
  amountMinor: number;
}>;

export type CalendarDayTransaction = Readonly<{
  id: string;
  amountMinor: number;
  targetAmountMinor: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  payerDisplayName: string;
  allocations: readonly CalendarAllocationDetail[];
}>;

export type CalendarReadyData = Readonly<{
  kind: "ready";
  group: Readonly<{
    id: string;
    name: string;
    timezone: string;
    weekStartsOn: 0 | 1;
  }>;
  month: string;
  currentMonth: string;
  today: string;
  scope: CalendarScope;
  selectedMemberId?: string;
  selectedMemberLabel?: string;
  selectedDay?: string;
  members: readonly CalendarMember[];
  monthlyTotal: number;
  monthlyPaidTotal?: number;
  dailyTotals: Readonly<Record<string, number>>;
  grid: readonly CalendarGridCell[];
  dayTransactionsByDate: Readonly<
    Record<string, readonly CalendarDayTransaction[]>
  >;
}>;

export type CalendarInvalidData = Readonly<{
  kind: "invalid";
  groupId: string;
  currentMonth: string;
  reason: "invalid_month" | "invalid_scope" | "invalid_member" | "invalid_day";
}>;

// 表示条件の検証結果に応じて「表示可能」か「不正」のどちらかになる状態union
export type GroupCalendarData = CalendarReadyData | CalendarInvalidData;

export type CalendarSearchInput = Readonly<{
  month?: string | string[];
  scope?: string | string[];
  member?: string | string[];
  day?: string | string[];
}>;
