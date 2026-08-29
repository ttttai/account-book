import { describe, expect, it } from "vitest";

import {
  calculateCalendarSummary,
  formatCalendarCellJpy,
} from "./calendar-summary";

const firstMemberId = "10000000-0000-4000-8000-000000000001";
const secondMemberId = "10000000-0000-4000-8000-000000000002";
const expenses = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    date: "2026-08-01",
    amountMinor: 6000,
    payerMemberId: firstMemberId,
    createdAt: "2026-08-01T10:00:00Z",
    category: { name: "食費", color: "food", icon: "utensils" },
    allocations: [
      { memberId: firstMemberId, amountMinor: 3000 },
      { memberId: secondMemberId, amountMinor: 3000 },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    date: "2026-08-01",
    amountMinor: 500,
    payerMemberId: secondMemberId,
    createdAt: "2026-08-01T11:00:00Z",
    category: { name: "交通", color: "transport", icon: "train" },
    allocations: [{ memberId: firstMemberId, amountMinor: 500 }],
  },
] as const;

describe("calculateCalendarSummary", () => {
  it("グループ支出は取引を一度ずつ合計する", () => {
    expect(calculateCalendarSummary(expenses, { scope: "group" })).toEqual({
      monthlyTotal: 6500,
      dailyTotals: { "2026-08-01": 6500 },
    });
  });

  it("メンバー利用額と支払額を分ける", () => {
    expect(
      calculateCalendarSummary(expenses, {
        scope: "member",
        memberId: firstMemberId,
      }),
    ).toEqual({
      monthlyTotal: 3500,
      monthlyPaidTotal: 6000,
      dailyTotals: { "2026-08-01": 3500 },
    });
  });

  it("対象負担がない日は合計を作らない", () => {
    expect(
      calculateCalendarSummary([expenses[1]], {
        scope: "member",
        memberId: secondMemberId,
      }),
    ).toEqual({
      monthlyTotal: 0,
      monthlyPaidTotal: 500,
      dailyTotals: {},
    });
  });

  it("安全整数を超える合計を拒否する", () => {
    expect(() =>
      calculateCalendarSummary(
        [
          { ...expenses[0], amountMinor: Number.MAX_SAFE_INTEGER },
          { ...expenses[1], amountMinor: 1 },
        ],
        { scope: "group" },
      ),
    ).toThrow("calendar amount overflow");
  });
});

describe("formatCalendarCellJpy", () => {
  it.each([
    [0, "0"],
    [9999, "9,999"],
    [10000, "10,000"],
    [12345, "12,345"],
    [99999, "99,999"],
    [1234567, "1,234,567"],
  ])("%i円を%sと表示する", (amount, expected) => {
    expect(formatCalendarCellJpy(amount)).toBe(expected);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "不正な金額%sを拒否する",
    (amount) => {
      expect(() => formatCalendarCellJpy(amount)).toThrow("invalid JPY amount");
    },
  );
});
