import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AnalyticsTrendMonth } from "../domain/analytics-trend-chart";
import { AnalyticsMonthlyTrendChart } from "./analytics-monthly-trend-chart";

const MONTHS: readonly AnalyticsTrendMonth[] = [
  {
    month: "2026-07",
    expenseTotal: 20000,
    incomeTotal: 5000,
    cumulativeBalance: -15000,
  },
  {
    month: "2026-08",
    expenseTotal: 0,
    incomeTotal: 10000,
    cumulativeBalance: -5000,
  },
  {
    month: "2026-09",
    expenseTotal: 10000,
    incomeTotal: 40000,
    cumulativeBalance: 25000,
  },
];

function renderChart(months: readonly AnalyticsTrendMonth[] = MONTHS) {
  return render(<AnalyticsMonthlyTrendChart months={months} />);
}

function bars(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-trend-bar]")];
}

function monthsOf(count: number, startYear = 2026): AnalyticsTrendMonth[] {
  return Array.from({ length: count }, (_, index) => ({
    month: `${startYear + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`,
    expenseTotal: 100,
    incomeTotal: 0,
    cumulativeBalance: -100 * (index + 1),
  }));
}

afterEach(() => {
  cleanup();
});

describe("AnalyticsMonthlyTrendChart", () => {
  it("初期表示は支出で、月数と同じ本数の棒を装飾として描き、最大値と0円のラベルを添える (AC-ANA-015-1、AC-ANA-015-2)", () => {
    const { container } = renderChart();

    const chart = container.querySelector("[data-details-chart='trend']");
    expect(chart?.getAttribute("aria-hidden")).toBe("true");
    expect(chart?.getAttribute("data-trend-series")).toBe("expense");
    const baseline = chart?.querySelector<HTMLElement>("[data-chart-baseline]");
    // 支出・収入の基準線は下端にある
    expect(baseline?.style.top).toBe("100%");
    const expenseBars = bars(container);
    expect(expenseBars).toHaveLength(3);
    expect(
      expenseBars.map((bar) => bar.getAttribute("data-trend-bar")),
    ).toEqual(["expense", "expense", "expense"]);
    expect(expenseBars.map((bar) => bar.style.height)).toEqual([
      "100%",
      "0%",
      "50%",
    ]);
    expect(expenseBars.map((bar) => bar.style.top)).toEqual([
      "0%",
      "100%",
      "50%",
    ]);
    // 縦軸は最大値と0円、横軸は各月のラベルを文字で持つ
    expect(chart?.textContent).toContain("￥20,000");
    expect(chart?.textContent).toContain("￥0");
    expect(chart?.textContent).toContain("7月");
    expect(chart?.textContent).toContain("9月");

    const toggle = screen.getByRole("group", { name: "月別推移の系列" });
    expect(
      within(toggle)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["支出", "収入", "貯金額"]);
    expect(
      within(toggle)
        .getByRole("button", { name: "支出" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(toggle)
        .getByRole("button", { name: "収入" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    // 支出・収入では期間末の累積収支と貯金額の注記を出さない
    expect(screen.queryByText("期間末の累積収支")).toBeNull();
    expect(container.textContent).not.toContain("期間開始時を0円として計算");
  });

  it("「収入」で収入の棒へ即時に切り替わり、リンク遷移やformを使わない (AC-ANA-015-1)", () => {
    const { container } = renderChart();

    fireEvent.click(screen.getByRole("button", { name: "収入" }));

    const chart = container.querySelector("[data-details-chart='trend']");
    expect(chart?.getAttribute("data-trend-series")).toBe("income");
    const incomeBars = bars(container);
    expect(incomeBars).toHaveLength(3);
    expect(incomeBars.map((bar) => bar.getAttribute("data-trend-bar"))).toEqual(
      ["income", "income", "income"],
    );
    expect(incomeBars.map((bar) => bar.style.height)).toEqual([
      "12.5%",
      "25%",
      "100%",
    ]);
    expect(chart?.textContent).toContain("￥40,000");
    expect(
      screen.getByRole("button", { name: "収入" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "支出" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(container.querySelector("a[href]")).toBeNull();
    expect(container.querySelector("form")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "支出" }));
    expect(chart?.getAttribute("data-trend-series")).toBe("expense");
  });

  it("「貯金額」は累積収支を基準線から上下へ伸びる棒で描き、期間末の値と注記を同じ領域に出す (AC-ANA-013-2、AC-ANA-013-3、AC-ANA-015-1)", () => {
    const { container } = renderChart();

    fireEvent.click(screen.getByRole("button", { name: "貯金額" }));

    const chart = container.querySelector("[data-details-chart='trend']");
    expect(chart?.getAttribute("data-trend-series")).toBe("savings");
    expect(chart?.getAttribute("aria-hidden")).toBe("true");
    const savingsBars = bars(container);
    expect(savingsBars).toHaveLength(3);
    expect(
      savingsBars.map((bar) => bar.getAttribute("data-chart-bar")),
    ).toEqual(["negative", "negative", "positive"]);
    // 最大25,000・最小-15,000の範囲では、0円は上から62.5%の位置になる
    const baseline = chart?.querySelector<HTMLElement>("[data-chart-baseline]");
    expect(baseline?.style.top).toBe("62.5%");
    // 赤字の棒は基準線から下へ、黒字の棒は上端から基準線まで伸びる
    expect(savingsBars[0]?.style.top).toBe("62.5%");
    expect(savingsBars[0]?.style.height).toBe("37.5%");
    expect(savingsBars[2]?.style.top).toBe("0%");
    expect(savingsBars[2]?.style.height).toBe("62.5%");
    // 縦軸は符号付きの上端・下端、期間末の累積収支と注記を同じ領域に表示する
    expect(chart?.textContent).toContain("＋￥25,000");
    expect(chart?.textContent).toContain("−￥15,000");
    expect(chart?.textContent).toContain("7月");
    const summary = screen.getByText("期間末の累積収支").parentElement;
    expect(summary?.textContent).toContain("＋￥25,000");
    expect(container.textContent).toContain("期間開始時を0円として計算");
    expect(container.textContent).toContain("「累積収支」で確認できます");
    expect(
      screen
        .getByRole("button", { name: "貯金額" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(container.querySelector("a[href]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "支出" }));
    expect(chart?.getAttribute("data-trend-series")).toBe("expense");
    expect(screen.queryByText("期間末の累積収支")).toBeNull();
  });

  it("貯金額が全月0円でも基準線を中央に置き、各月の棒を描く (AC-ANA-015-2)", () => {
    const { container } = renderChart([
      {
        month: "2026-08",
        expenseTotal: 0,
        incomeTotal: 0,
        cumulativeBalance: 0,
      },
      {
        month: "2026-09",
        expenseTotal: 0,
        incomeTotal: 0,
        cumulativeBalance: 0,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "貯金額" }));

    const chart = container.querySelector("[data-details-chart='trend']");
    expect(
      chart?.querySelector<HTMLElement>("[data-chart-baseline]")?.style.top,
    ).toBe("50%");
    expect(bars(container)).toHaveLength(2);
    expect(
      bars(container).map((bar) => bar.getAttribute("data-chart-bar")),
    ).toEqual(["zero", "zero"]);
    expect(chart?.textContent).toContain("±￥0");
  });

  it("7〜12か月では終了月から1か月おきの月ラベルだけを描く (AC-ANA-015-2)", () => {
    const { container } = renderChart(monthsOf(12));
    const chart = container.querySelector("[data-details-chart='trend']");
    expect(chart?.getAttribute("data-trend-labels")).toBe("alternate");
    expect(bars(container)).toHaveLength(12);
    const axisLabels = [
      ...(chart?.querySelectorAll(":scope > div:last-child > span") ?? []),
    ].map((label) => label.textContent);
    expect(axisLabels).toEqual(["2月", "4月", "6月", "8月", "10月", "12月"]);
  });

  it("全月0円でも各月の棒を描き、13か月以上では開始月・終了月だけのラベルにする (AC-ANA-015-2)", () => {
    const { container } = renderChart([
      {
        month: "2026-08",
        expenseTotal: 0,
        incomeTotal: 0,
        cumulativeBalance: 0,
      },
      {
        month: "2026-09",
        expenseTotal: 0,
        incomeTotal: 0,
        cumulativeBalance: 0,
      },
    ]);
    expect(bars(container)).toHaveLength(2);
    expect(bars(container)[0]?.style.height).toBe("0%");

    cleanup();
    const long = renderChart(
      monthsOf(13, 2025).map((month, index) => ({
        ...month,
        month: `${2025 + Math.floor((index + 8) / 12)}-${String(((index + 8) % 12) + 1).padStart(2, "0")}`,
      })),
    );
    const chart = long.container.querySelector("[data-details-chart='trend']");
    expect(chart?.getAttribute("data-trend-labels")).toBe("edges");
    expect(bars(long.container)).toHaveLength(13);
    expect(chart?.textContent).toContain("2025年9月");
    expect(chart?.textContent).toContain("2026年9月");
    expect(chart?.textContent).not.toContain("10月");
  });
});
