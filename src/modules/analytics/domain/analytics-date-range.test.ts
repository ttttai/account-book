import { describe, expect, it } from "vitest";

import {
  aggregateAnalyticsDateRange,
  aggregateAnalyticsMonth,
  type AnalyticsExpenseInput,
  type AnalyticsIncomeInput,
} from "./analytics-summary";

const MEMBER_A = "40000000-0000-4000-8000-00000000000a";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";

function expense(
  date: string,
  amountMinor: number,
  categoryId: string,
): AnalyticsExpenseInput {
  return {
    date,
    amountMinor,
    payerMemberId: MEMBER_A,
    categoryId,
    categoryName: categoryId === FOOD ? "食費" : "住居",
    categoryColor: categoryId === FOOD ? "food" : "home",
    allocations: [{ memberId: MEMBER_A, amountMinor }],
  };
}

const expenses: readonly AnalyticsExpenseInput[] = [
  expense("2026-08-30", 300, FOOD),
  expense("2026-08-31", 1200, FOOD),
  expense("2026-09-03", 500, HOME),
  expense("2026-09-06", 800, FOOD),
  expense("2026-09-07", 9999, FOOD),
  expense("2026-09-25", 40000, HOME),
];

const incomes: readonly AnalyticsIncomeInput[] = [
  { date: "2026-09-01", amountMinor: 300000, recipientMemberId: MEMBER_A },
  { date: "2026-08-25", amountMinor: 5000, recipientMemberId: MEMBER_A },
];

const group = { scope: "group" } as const;

describe("aggregateAnalyticsDateRange", () => {
  it("両端を含む日付範囲の支出・件数・収入・カテゴリ別支出を集計する (AC-NOTIF-003-1)", () => {
    const totals = aggregateAnalyticsDateRange(
      { start: "2026-08-31", end: "2026-09-06" },
      expenses,
      incomes,
      group,
    );

    expect(totals).toEqual({
      start: "2026-08-31",
      end: "2026-09-06",
      expenseTotal: 2500,
      expenseCount: 3,
      incomeTotal: 300000,
      balance: 297500,
      expenseByCategory: [
        { categoryId: FOOD, name: "食費", color: "food", amountMinor: 2000 },
        { categoryId: HOME, name: "住居", color: "home", amountMinor: 500 },
      ],
    });
  });

  it("月全体の範囲は月版の集計と同じ金額になる", () => {
    const range = aggregateAnalyticsDateRange(
      { start: "2026-09-01", end: "2026-09-30" },
      expenses,
      incomes,
      group,
    );
    const month = aggregateAnalyticsMonth("2026-09", expenses, incomes, group);

    expect(range.expenseTotal).toBe(month.expenseTotal);
    expect(range.incomeTotal).toBe(month.incomeTotal);
    expect(range.balance).toBe(month.balance);
    expect(range.expenseByCategory).toEqual(month.expenseByCategory);
    expect(range.expenseCount).toBe(4);
  });

  it("メンバー対象では負担額だけを数え、負担のない支出は件数にも入れない", () => {
    const other = "40000000-0000-4000-8000-00000000000b";
    const totals = aggregateAnalyticsDateRange(
      { start: "2026-09-01", end: "2026-09-30" },
      [
        ...expenses,
        {
          ...expense("2026-09-10", 3000, FOOD),
          allocations: [{ memberId: other, amountMinor: 3000 }],
        },
      ],
      incomes,
      { scope: "member", memberId: MEMBER_A },
    );

    expect(totals.expenseTotal).toBe(51299);
    expect(totals.expenseCount).toBe(4);
  });

  it("不正な日付や逆順の範囲は例外にする", () => {
    expect(() =>
      aggregateAnalyticsDateRange(
        { start: "2026-09-07", end: "2026-09-01" },
        expenses,
        incomes,
        group,
      ),
    ).toThrow("invalid analytics date range");
    expect(() =>
      aggregateAnalyticsDateRange(
        { start: "2026-9-1", end: "2026-09-07" },
        expenses,
        incomes,
        group,
      ),
    ).toThrow("invalid analytics date range");
  });
});
