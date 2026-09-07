import { describe, expect, it } from "vitest";

import {
  ANALYTICS_TREND_ALTERNATE_LABEL_MAX_MONTHS,
  ANALYTICS_TREND_EACH_LABEL_MAX_MONTHS,
  formatAnalyticsTrendMonthLabel,
  layoutAnalyticsTrendChart,
} from "./analytics-trend-chart";

function month(value: string, expenseTotal: number, incomeTotal: number) {
  return { month: value, expenseTotal, incomeTotal };
}

describe("layoutAnalyticsTrendChart", () => {
  it("選択系列の最大値を縦軸の上端にし、各月の高さを最大値に対する比率で返す (AC-ANA-015-2)", () => {
    const chart = layoutAnalyticsTrendChart(
      [
        month("2026-07", 20000, 5000),
        month("2026-08", 0, 10000),
        month("2026-09", 10000, 40000),
      ],
      "expense",
    );

    expect(chart.series).toBe("expense");
    expect(chart.maxMinor).toBe(20000);
    expect(chart.bars.map((bar) => bar.amountMinor)).toEqual([20000, 0, 10000]);
    expect(chart.bars.map((bar) => bar.heightPercent)).toEqual([100, 0, 50]);
    // 3本の棒は幅33.333%の枡の中心に等間隔で並ぶ
    expect(chart.slotWidth).toBeCloseTo(33.333, 2);
    expect(chart.bars.map((bar) => bar.x)).toEqual([16.667, 50, 83.333]);
  });

  it("収入系列では収入だけを使い、支出を混入させない (AC-ANA-010-1、AC-ANA-015-1)", () => {
    const chart = layoutAnalyticsTrendChart(
      [month("2026-08", 90000, 10000), month("2026-09", 1000, 40000)],
      "income",
    );

    expect(chart.series).toBe("income");
    expect(chart.maxMinor).toBe(40000);
    expect(chart.bars.map((bar) => bar.heightPercent)).toEqual([25, 100]);
  });

  it("全月0円では最大値0・高さ0で棒の本数は月数のままとし、0除算を起こさない (AC-ANA-015-2)", () => {
    const chart = layoutAnalyticsTrendChart(
      [month("2026-08", 0, 0), month("2026-09", 0, 0)],
      "expense",
    );

    expect(chart.maxMinor).toBe(0);
    expect(chart.bars).toHaveLength(2);
    for (const bar of chart.bars) {
      expect(bar.heightPercent).toBe(0);
      expect(Number.isNaN(bar.x)).toBe(false);
    }
  });

  it("6か月以下は各月、7〜12か月は終了月から1か月おき、13か月以上は開始月・終了月だけのラベルにする (AC-ANA-015-2)", () => {
    const twelve = Array.from({ length: 12 }, (_, index) =>
      month(`2026-${String(index + 1).padStart(2, "0")}`, 100, 0),
    );
    const thirteen = [...twelve, month("2027-01", 100, 0)];

    expect(ANALYTICS_TREND_EACH_LABEL_MAX_MONTHS).toBe(6);
    expect(ANALYTICS_TREND_ALTERNATE_LABEL_MAX_MONTHS).toBe(12);
    const each = layoutAnalyticsTrendChart(twelve.slice(0, 6), "expense");
    expect(each.labelMode).toBe("each");
    expect(each.bars.map((bar) => bar.label)).toEqual([
      "1月",
      "2月",
      "3月",
      "4月",
      "5月",
      "6月",
    ]);

    // 7か月では終了月を含む1か月おきになり、開始月にはラベルが付かない
    const seven = layoutAnalyticsTrendChart(twelve.slice(0, 7), "expense");
    expect(seven.labelMode).toBe("alternate");
    expect(seven.bars.map((bar) => bar.label)).toEqual([
      "1月",
      undefined,
      "3月",
      undefined,
      "5月",
      undefined,
      "7月",
    ]);
    const alternate = layoutAnalyticsTrendChart(twelve, "expense");
    expect(alternate.labelMode).toBe("alternate");
    expect(alternate.bars.map((bar) => bar.label)).toEqual([
      undefined,
      "2月",
      undefined,
      "4月",
      undefined,
      "6月",
      undefined,
      "8月",
      undefined,
      "10月",
      undefined,
      "12月",
    ]);

    const edges = layoutAnalyticsTrendChart(thirteen, "expense");
    expect(edges.labelMode).toBe("edges");
    expect(edges.bars.every((bar) => bar.label === undefined)).toBe(true);
    expect(edges.bars).toHaveLength(13);
  });

  it("1か月だけでも棒1本を中央に置き、空配列は棒なしで返す", () => {
    const single = layoutAnalyticsTrendChart(
      [month("2026-09", 500, 0)],
      "expense",
    );
    expect(single.bars).toEqual([
      {
        month: "2026-09",
        amountMinor: 500,
        x: 50,
        heightPercent: 100,
        label: "9月",
      },
    ]);
    expect(single.slotWidth).toBe(100);

    const empty = layoutAnalyticsTrendChart([], "income");
    expect(empty.bars).toEqual([]);
    expect(empty.maxMinor).toBe(0);
  });

  it("負の金額や安全でない整数は例外にする", () => {
    expect(() =>
      layoutAnalyticsTrendChart([month("2026-09", -1, 0)], "expense"),
    ).toThrow(/invalid/);
    expect(() =>
      layoutAnalyticsTrendChart([month("2026-09", 0, 1.5)], "income"),
    ).toThrow(/invalid/);
  });
});

describe("formatAnalyticsTrendMonthLabel", () => {
  it("年を省いた`M月`を返す", () => {
    expect(formatAnalyticsTrendMonthLabel("2026-01")).toBe("1月");
    expect(formatAnalyticsTrendMonthLabel("2026-12")).toBe("12月");
  });
});
