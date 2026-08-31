import { describe, expect, it } from "vitest";

import {
  type CalendarIncome,
  calculateCalendarIncomeSummary,
} from "./calendar-summary";

const category = { name: "給与", color: "gray", icon: "salary" };

function income(
  id: string,
  date: string,
  amountMinor: number,
  recipientMemberId: string,
): CalendarIncome {
  return {
    id,
    date,
    amountMinor,
    recipientMemberId,
    createdAt: `${date}T00:00:00.000Z`,
    category,
  };
}

describe("calculateCalendarIncomeSummary", () => {
  const incomes = [
    income("i-1", "2026-08-25", 300000, "member-a"),
    income("i-2", "2026-08-25", 20000, "member-b"),
    income("i-3", "2026-08-28", 5000, "member-a"),
  ];

  it("グループ対象では全収入を月間・日別に集計する (AC-CAL-012-2)", () => {
    const summary = calculateCalendarIncomeSummary(incomes, {
      scope: "group",
    });
    expect(summary.monthlyIncomeTotal).toBe(325000);
    expect(summary.incomeDailyTotals).toEqual({
      "2026-08-25": 320000,
      "2026-08-28": 5000,
    });
  });

  it("メンバー対象では受取者が一致する収入だけを集計する (AC-CAL-012-2)", () => {
    const summary = calculateCalendarIncomeSummary(incomes, {
      scope: "member",
      memberId: "member-a",
    });
    expect(summary.monthlyIncomeTotal).toBe(305000);
    expect(summary.incomeDailyTotals).toEqual({
      "2026-08-25": 300000,
      "2026-08-28": 5000,
    });
  });

  it("収入がない場合は0円と空の日別合計を返す", () => {
    const summary = calculateCalendarIncomeSummary([], { scope: "group" });
    expect(summary.monthlyIncomeTotal).toBe(0);
    expect(summary.incomeDailyTotals).toEqual({});
  });

  it("安全な整数範囲を超える集計は例外にする", () => {
    const huge = [
      income("i-1", "2026-08-25", Number.MAX_SAFE_INTEGER, "member-a"),
      income("i-2", "2026-08-25", 1, "member-a"),
    ];
    expect(() =>
      calculateCalendarIncomeSummary(huge, { scope: "group" }),
    ).toThrow();
  });
});
