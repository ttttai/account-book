import { describe, expect, it } from "vitest";

import type {
  AnalyticsExpenseInput,
  AnalyticsIncomeInput,
  AnalyticsMonthTotals,
} from "./analytics-summary";
import {
  aggregateAnalyticsMembers,
  summarizeAnalyticsPeriod,
} from "./analytics-details";

const MEMBER_A = "40000000-0000-4000-8000-00000000000a";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";

const months: readonly AnalyticsMonthTotals[] = [
  {
    month: "2026-07",
    expenseTotal: 0,
    incomeTotal: 0,
    balance: 0,
    expenseByCategory: [],
  },
  {
    month: "2026-08",
    expenseTotal: 10001,
    incomeTotal: 20000,
    balance: 9999,
    expenseByCategory: [
      { categoryId: "food", name: "食費", color: "food", amountMinor: 7001 },
      { categoryId: "home", name: "住居", color: "home", amountMinor: 3000 },
    ],
  },
  {
    month: "2026-09",
    expenseTotal: 10001,
    incomeTotal: 5000,
    balance: -5001,
    expenseByCategory: [
      { categoryId: "food", name: "食費", color: "food", amountMinor: 4000 },
      { categoryId: "home", name: "住居", color: "home", amountMinor: 6001 },
    ],
  },
];

describe("summarizeAnalyticsPeriod", () => {
  it("月別値から期間合計、0円月を含む平均、最大支出月を作る", () => {
    expect(summarizeAnalyticsPeriod(months)).toMatchObject({
      expenseTotal: 20002,
      incomeTotal: 25000,
      balance: 4998,
      averageExpense: 6667,
      highestExpenseMonth: "2026-09",
    });
  });

  it("カテゴリをIDで期間合算して降順にし、全月0円なら最大月を返さない", () => {
    expect(summarizeAnalyticsPeriod(months).expenseByCategory).toEqual([
      {
        categoryId: "food",
        name: "食費",
        color: "food",
        amountMinor: 11001,
        sharePercent: 55,
      },
      {
        categoryId: "home",
        name: "住居",
        color: "home",
        amountMinor: 9001,
        sharePercent: 45,
      },
    ]);
    expect(
      summarizeAnalyticsPeriod([months[0] as AnalyticsMonthTotals]),
    ).toMatchObject({
      highestExpenseMonth: null,
      averageExpense: 0,
    });
  });
});

describe("aggregateAnalyticsMembers", () => {
  it("負担額・支払額・受取額を混在させずメンバー別に集計する", () => {
    const expenses: readonly AnalyticsExpenseInput[] = [
      {
        date: "2026-09-01",
        amountMinor: 6000,
        payerMemberId: MEMBER_A,
        categoryId: "food",
        categoryName: "食費",
        categoryColor: "food",
        allocations: [
          { memberId: MEMBER_A, amountMinor: 2000 },
          { memberId: MEMBER_B, amountMinor: 4000 },
        ],
      },
    ];
    const incomes: readonly AnalyticsIncomeInput[] = [
      { date: "2026-09-20", amountMinor: 10000, recipientMemberId: MEMBER_B },
    ];

    expect(
      aggregateAnalyticsMembers(
        [
          { membershipId: MEMBER_A, displayName: "A" },
          { membershipId: MEMBER_B, displayName: "B" },
        ],
        expenses,
        incomes,
      ),
    ).toEqual([
      {
        membershipId: MEMBER_A,
        displayName: "A",
        usageTotal: 2000,
        paidTotal: 6000,
        receivedTotal: 0,
      },
      {
        membershipId: MEMBER_B,
        displayName: "B",
        usageTotal: 4000,
        paidTotal: 0,
        receivedTotal: 10000,
      },
    ]);
  });
});
