import { describe, expect, it } from "vitest";

import { accumulateAnalyticsBalance } from "./analytics-savings";
import type { AnalyticsMonthTotals } from "./analytics-summary";

function month(
  value: string,
  expenseTotal: number,
  incomeTotal: number,
): AnalyticsMonthTotals {
  return {
    month: value,
    expenseTotal,
    incomeTotal,
    balance: incomeTotal - expenseTotal,
    expenseByCategory: [],
  };
}

describe("accumulateAnalyticsBalance", () => {
  it("開始直前を0円として月別収支を順に加算し、0円月は前月の値を引き継ぐ (AC-ANA-013-1)", () => {
    const result = accumulateAnalyticsBalance([
      month("2026-06", 10000, 30000),
      month("2026-07", 0, 0),
      month("2026-08", 50000, 5000),
      month("2026-09", 1000, 26000),
    ]);

    expect(result).toEqual([
      { month: "2026-06", balance: 20000, cumulativeBalance: 20000 },
      { month: "2026-07", balance: 0, cumulativeBalance: 20000 },
      { month: "2026-08", balance: -45000, cumulativeBalance: -25000 },
      { month: "2026-09", balance: 25000, cumulativeBalance: 0 },
    ]);
  });

  it("最終月の累積収支は期間の収支合計と一致する (AC-ANA-013-1)", () => {
    const months = [
      month("2026-07", 12345, 0),
      month("2026-08", 0, 99999),
      month("2026-09", 500, 1),
    ];
    const result = accumulateAnalyticsBalance(months);
    const periodBalance = months.reduce((sum, item) => sum + item.balance, 0);

    expect(result.at(-1)?.cumulativeBalance).toBe(periodBalance);
    expect(result.at(-1)?.cumulativeBalance).toBe(87155);
  });

  it("空の期間は空配列、安全な整数を超える累積は例外にする", () => {
    expect(accumulateAnalyticsBalance([])).toEqual([]);
    expect(() =>
      accumulateAnalyticsBalance([
        month("2026-08", 0, Number.MAX_SAFE_INTEGER),
        month("2026-09", 0, 1),
      ]),
    ).toThrow(/overflow/);
  });
});
