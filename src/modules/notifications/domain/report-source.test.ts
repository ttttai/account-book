import { describe, expect, it } from "vitest";

import {
  toAnalyticsInputs,
  toBudgetRevision,
  type WeeklyReportSource,
} from "./report-source";

const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";
const RENT = "60000000-0000-4000-8000-000000000001";
const MEMBER_A = "40000000-0000-4000-8000-000000000001";
const MEMBER_B = "40000000-0000-4000-8000-000000000002";

const source: WeeklyReportSource = {
  expenses: [
    {
      date: "2026-09-03",
      amountMinor: 500,
      categoryId: FOOD,
      categoryName: "食費",
      categoryColor: "food",
      payerMemberId: MEMBER_A,
      allocations: [
        { memberId: MEMBER_A, amountMinor: 300 },
        { memberId: MEMBER_B, amountMinor: 200 },
      ],
    },
  ],
  incomes: [{ date: "2026-09-01", amountMinor: 300000 }],
  recurring: [
    {
      id: RENT,
      type: "expense",
      amountMinor: 80000,
      dayOfMonth: 25,
      startMonth: "2026-08",
      endMonth: null,
      categoryId: HOME,
      categoryName: "住居",
      categoryColor: "home",
      payerMemberId: MEMBER_B,
      allocations: [
        { memberId: MEMBER_A, amountMinor: 40000 },
        { memberId: MEMBER_B, amountMinor: 40000 },
      ],
    },
    {
      id: "60000000-0000-4000-8000-000000000002",
      type: "income",
      amountMinor: 1000,
      dayOfMonth: 1,
      startMonth: "2026-09",
      endMonth: "2026-09",
      categoryId: "30000000-0000-4000-8000-000000000009",
      categoryName: "給与",
      categoryColor: "salary",
      payerMemberId: null,
      allocations: [],
    },
  ],
  budget: {
    effectiveMonth: "2026-09",
    status: "active",
    totalAmountMinor: 300000,
    version: 2,
    categoryLimits: [
      {
        categoryId: FOOD,
        categoryName: "食費",
        categoryColor: "food",
        amountMinor: 50000,
      },
    ],
  },
  members: [
    { id: MEMBER_A, displayName: "たいし" },
    { id: MEMBER_B, displayName: "かこ" },
  ],
};

describe("toAnalyticsInputs", () => {
  it("単発取引と各月へ展開した固定費を、分析の集計入力へ変換する (AC-NOTIF-003-1)", () => {
    const inputs = toAnalyticsInputs(source, ["2026-08", "2026-09"]);

    expect(
      inputs.expenses.map((item) => [item.date, item.amountMinor]),
    ).toEqual([
      ["2026-09-03", 500],
      ["2026-08-25", 80000],
      ["2026-09-25", 80000],
    ]);
    expect(inputs.expenses[1]).toMatchObject({
      categoryId: HOME,
      categoryName: "住居",
      categoryColor: "home",
    });
    // 収入の固定費は対象月だけ展開され、終了月以降は含まれない
    expect(inputs.incomes.map((item) => [item.date, item.amountMinor])).toEqual(
      [
        ["2026-09-01", 300000],
        ["2026-09-01", 1000],
      ],
    );
  });

  it("メンバー対象の集計のため、支払者と負担額を単発取引・固定費の両方に渡す (AC-NOTIF-003-1)", () => {
    const inputs = toAnalyticsInputs(source, ["2026-09"]);

    expect(inputs.expenses[0]).toMatchObject({
      payerMemberId: MEMBER_A,
      allocations: [
        { memberId: MEMBER_A, amountMinor: 300 },
        { memberId: MEMBER_B, amountMinor: 200 },
      ],
    });
    expect(inputs.expenses[1]).toMatchObject({
      date: "2026-09-25",
      payerMemberId: MEMBER_B,
      allocations: [
        { memberId: MEMBER_A, amountMinor: 40000 },
        { memberId: MEMBER_B, amountMinor: 40000 },
      ],
    });
    for (const item of inputs.incomes) {
      expect(item.recipientMemberId).toBe("");
    }
  });

  it("固定費の展開結果を別配列でも返し、変動費と区別できるようにする (AC-NOTIF-003-3)", () => {
    const inputs = toAnalyticsInputs(source, ["2026-08", "2026-09"]);

    expect(
      inputs.recurringExpenses.map((item) => [item.date, item.amountMinor]),
    ).toEqual([
      ["2026-08-25", 80000],
      ["2026-09-25", 80000],
    ]);
    // 展開結果はexpensesにも同じ参照で含まれる
    for (const item of inputs.recurringExpenses) {
      expect(inputs.expenses).toContain(item);
    }
  });

  it("支払者が未設定の行は空文字で渡す", () => {
    const inputs = toAnalyticsInputs(
      {
        ...source,
        expenses: [{ ...source.expenses[0], payerMemberId: null }],
        recurring: [],
      },
      ["2026-09"],
    );
    expect(inputs.expenses[0]?.payerMemberId).toBe("");
  });
});

describe("toBudgetRevision", () => {
  it("適用改定を予算モジュールの改定型へ変換する (AC-NOTIF-003-2)", () => {
    expect(toBudgetRevision(source.budget)).toEqual({
      id: "line-report:2026-09",
      effectiveMonth: "2026-09",
      status: "active",
      totalAmountMinor: 300000,
      version: 2,
      categoryLimits: [
        {
          category: { id: FOOD, name: "食費", color: "food" },
          amountMinor: 50000,
        },
      ],
    });
  });

  it("適用改定がない月はnullのまま返す", () => {
    expect(toBudgetRevision(null)).toBeNull();
  });
});
