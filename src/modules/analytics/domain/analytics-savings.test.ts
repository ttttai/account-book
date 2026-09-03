import { describe, expect, it } from "vitest";

import {
  accumulateAnalyticsBalance,
  scaleAnalyticsSavingsChart,
} from "./analytics-savings";
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

describe("scaleAnalyticsSavingsChart", () => {
  it("縦軸は0円を含み、0円の基準線と各月の座標を0〜100の範囲で返す (AC-ANA-013-2)", () => {
    const chart = scaleAnalyticsSavingsChart([
      { month: "2026-07", balance: 20000, cumulativeBalance: 20000 },
      { month: "2026-08", balance: -60000, cumulativeBalance: -40000 },
      { month: "2026-09", balance: 20000, cumulativeBalance: -20000 },
    ]);

    expect(chart.maxMinor).toBe(20000);
    expect(chart.minMinor).toBe(-40000);
    // 最大20000・最小-40000の範囲では、0円は上から1/3の位置になる
    expect(chart.zeroY).toBeCloseTo(33.333, 2);
    expect(chart.points.map((point) => point.x)).toEqual([0, 50, 100]);
    expect(chart.points.map((point) => point.y)).toEqual([0, 100, 66.667]);
  });

  it("全月が黒字なら最小値を0円にし、赤字だけなら最大値を0円にする", () => {
    const positive = scaleAnalyticsSavingsChart([
      { month: "2026-08", balance: 1000, cumulativeBalance: 1000 },
      { month: "2026-09", balance: 3000, cumulativeBalance: 4000 },
    ]);
    expect(positive.minMinor).toBe(0);
    expect(positive.zeroY).toBe(100);

    const negative = scaleAnalyticsSavingsChart([
      { month: "2026-09", balance: -3000, cumulativeBalance: -3000 },
    ]);
    expect(negative.maxMinor).toBe(0);
    expect(negative.zeroY).toBe(0);
  });

  it("1か月だけの期間は中央に点1つを置き、全月0円でも0除算せず基準線上に並べる", () => {
    const single = scaleAnalyticsSavingsChart([
      { month: "2026-09", balance: 500, cumulativeBalance: 500 },
    ]);
    expect(single.points).toEqual([{ month: "2026-09", x: 50, y: 0 }]);

    const flat = scaleAnalyticsSavingsChart([
      { month: "2026-08", balance: 0, cumulativeBalance: 0 },
      { month: "2026-09", balance: 0, cumulativeBalance: 0 },
    ]);
    expect(flat.zeroY).toBe(50);
    expect(flat.points.map((point) => point.y)).toEqual([50, 50]);
  });
});
