import { describe, expect, it } from "vitest";

import {
  type BudgetRevision,
  firstDayToMonth,
  isBudgetMonthEditable,
  monthToFirstDay,
  resolveAppliedBudgetRevision,
} from "./budget-revision";

const FOOD = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "食費",
  color: "food",
};

function revision(
  effectiveMonth: string,
  totalAmountMinor: number | null,
  overrides: Partial<BudgetRevision> = {},
): BudgetRevision {
  return {
    id: `id-${effectiveMonth}`,
    effectiveMonth,
    status: totalAmountMinor === null ? "disabled" : "active",
    totalAmountMinor,
    version: 1,
    categoryLimits:
      totalAmountMinor === null
        ? []
        : [{ category: FOOD, amountMinor: Math.min(totalAmountMinor, 100000) }],
    ...overrides,
  };
}

const revisions = [
  revision("2026-09", 300000),
  revision("2026-12", 320000),
  revision("2027-03", null),
];

describe("resolveAppliedBudgetRevision", () => {
  it("対象月以前で最も新しい開始月の改定を適用する (AC-BUD-005-1)", () => {
    expect(
      resolveAppliedBudgetRevision(revisions, "2026-09")?.effectiveMonth,
    ).toBe("2026-09");
    expect(
      resolveAppliedBudgetRevision(revisions, "2026-11")?.effectiveMonth,
    ).toBe("2026-09");
    expect(
      resolveAppliedBudgetRevision(revisions, "2026-12")?.effectiveMonth,
    ).toBe("2026-12");
    expect(
      resolveAppliedBudgetRevision(revisions, "2027-02")?.effectiveMonth,
    ).toBe("2026-12");
  });

  it("開始月より前の月には適用せず、入力順序に依存しない", () => {
    expect(resolveAppliedBudgetRevision(revisions, "2026-08")).toBeNull();
    expect(
      resolveAppliedBudgetRevision([...revisions].reverse(), "2026-11")
        ?.effectiveMonth,
    ).toBe("2026-09");
  });

  it("停止改定は適用改定として返し、呼び出し側が未設定と判定できる (AC-BUD-006-1)", () => {
    const applied = resolveAppliedBudgetRevision(revisions, "2027-05");
    expect(applied?.effectiveMonth).toBe("2027-03");
    expect(applied?.status).toBe("disabled");
    expect(applied?.totalAmountMinor).toBeNull();
  });
});

describe("isBudgetMonthEditable", () => {
  it("当月と将来月だけを変更可能にする (AC-BUD-001-3)", () => {
    expect(isBudgetMonthEditable("2026-09", "2026-09")).toBe(true);
    expect(isBudgetMonthEditable("2027-01", "2026-09")).toBe(true);
    expect(isBudgetMonthEditable("2026-08", "2026-09")).toBe(false);
    expect(isBudgetMonthEditable("2025-12", "2026-09")).toBe(false);
  });
});

describe("month conversion", () => {
  it("YYYY-MMと月初日を相互に変換する", () => {
    expect(monthToFirstDay("2026-09")).toBe("2026-09-01");
    expect(firstDayToMonth("2026-09-01")).toBe("2026-09");
  });
});
