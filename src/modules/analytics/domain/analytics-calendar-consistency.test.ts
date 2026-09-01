import { describe, expect, it } from "vitest";

import {
  type CalendarExpense,
  type CalendarIncome,
  calculateCalendarIncomeSummary,
  calculateCalendarSummary,
} from "@/modules/calendar";

import {
  aggregateAnalyticsMonth,
  type AnalyticsExpenseInput,
  type AnalyticsIncomeInput,
} from "./analytics-summary";

const MEMBER_A = "40000000-0000-4000-8000-00000000000a";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";

const calendarExpenses: readonly CalendarExpense[] = [
  {
    id: "1",
    date: "2026-09-03",
    amountMinor: 6000,
    payerMemberId: MEMBER_A,
    createdAt: "2026-09-03T00:00:00Z",
    category: { name: "食費", color: "food", icon: "food" },
    allocations: [
      { memberId: MEMBER_A, amountMinor: 3000 },
      { memberId: MEMBER_B, amountMinor: 3000 },
    ],
  },
  {
    id: "2",
    date: "2026-09-27",
    amountMinor: 4000,
    payerMemberId: MEMBER_B,
    createdAt: "2026-09-27T00:00:00Z",
    category: { name: "住居", color: "home", icon: "home" },
    allocations: [{ memberId: MEMBER_A, amountMinor: 4000 }],
  },
];

const calendarIncomes: readonly CalendarIncome[] = [
  {
    id: "3",
    date: "2026-09-25",
    amountMinor: 300000,
    recipientMemberId: MEMBER_A,
    createdAt: "2026-09-25T00:00:00Z",
    category: { name: "給与", color: "salary", icon: "salary" },
  },
  {
    id: "4",
    date: "2026-09-26",
    amountMinor: 50000,
    recipientMemberId: MEMBER_B,
    createdAt: "2026-09-26T00:00:00Z",
    category: { name: "臨時収入", color: "extra", icon: "extra" },
  },
];

const analyticsExpenses: readonly AnalyticsExpenseInput[] = [
  {
    date: "2026-09-03",
    amountMinor: 6000,
    categoryId: FOOD,
    categoryName: "食費",
    categoryColor: "food",
    allocations: [
      { memberId: MEMBER_A, amountMinor: 3000 },
      { memberId: MEMBER_B, amountMinor: 3000 },
    ],
  },
  {
    date: "2026-09-27",
    amountMinor: 4000,
    categoryId: HOME,
    categoryName: "住居",
    categoryColor: "home",
    allocations: [{ memberId: MEMBER_A, amountMinor: 4000 }],
  },
];

const analyticsIncomes: readonly AnalyticsIncomeInput[] = [
  { date: "2026-09-25", amountMinor: 300000, recipientMemberId: MEMBER_A },
  { date: "2026-09-26", amountMinor: 50000, recipientMemberId: MEMBER_B },
];

// カレンダーと分析の集計定義が同じであることを、同じ取引集合で証明する (AC-ANA-002-1)
describe("カレンダーと概要分析の集計定義", () => {
  it.each([
    ["group", { scope: "group" } as const],
    ["member", { scope: "member", memberId: MEMBER_A } as const],
  ])("%s対象で月間支出・収入合計が一致する", (_label, target) => {
    const calendar = calculateCalendarSummary(calendarExpenses, target);
    const calendarIncome = calculateCalendarIncomeSummary(
      calendarIncomes,
      target,
    );
    const analytics = aggregateAnalyticsMonth(
      "2026-09",
      analyticsExpenses,
      analyticsIncomes,
      target,
    );

    expect(analytics.expenseTotal).toBe(calendar.monthlyTotal);
    expect(analytics.incomeTotal).toBe(calendarIncome.monthlyIncomeTotal);
    expect(analytics.balance).toBe(
      calendarIncome.monthlyIncomeTotal - calendar.monthlyTotal,
    );
  });
});
