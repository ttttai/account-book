import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnalyticsMonthlyTrendChart } from "./analytics-monthly-trend-chart";

const MONTHS = [
  { month: "2026-07", expenseTotal: 20000, incomeTotal: 5000 },
  { month: "2026-08", expenseTotal: 0, incomeTotal: 10000 },
  { month: "2026-09", expenseTotal: 10000, incomeTotal: 40000 },
] as const;

function renderChart(months: typeof MONTHS | [] = MONTHS) {
  return render(<AnalyticsMonthlyTrendChart months={months} />);
}

function bars(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-trend-bar]")];
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
    expect(chart?.querySelector("[data-chart-baseline]")).toBeTruthy();
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
    // 縦軸は最大値と0円、横軸は各月のラベルを文字で持つ
    expect(chart?.textContent).toContain("￥20,000");
    expect(chart?.textContent).toContain("￥0");
    expect(chart?.textContent).toContain("7月");
    expect(chart?.textContent).toContain("9月");

    const toggle = screen.getByRole("group", { name: "月別推移の系列" });
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

  it("7〜12か月では終了月から1か月おきの月ラベルだけを描く (AC-ANA-015-2)", () => {
    const twelve = Array.from({ length: 12 }, (_, index) => ({
      month: `2026-${String(index + 1).padStart(2, "0")}`,
      expenseTotal: 100,
      incomeTotal: 0,
    }));
    const { container } = render(
      <AnalyticsMonthlyTrendChart
        months={twelve as unknown as typeof MONTHS}
      />,
    );
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
      { month: "2026-08", expenseTotal: 0, incomeTotal: 0 },
      { month: "2026-09", expenseTotal: 0, incomeTotal: 0 },
    ] as unknown as typeof MONTHS);
    expect(bars(container)).toHaveLength(2);
    expect(bars(container)[0]?.style.height).toBe("0%");

    cleanup();
    const thirteen = Array.from({ length: 13 }, (_, index) => ({
      month: `${2025 + Math.floor((index + 8) / 12)}-${String(((index + 8) % 12) + 1).padStart(2, "0")}`,
      expenseTotal: 100,
      incomeTotal: 0,
    }));
    const long = render(
      <AnalyticsMonthlyTrendChart
        months={thirteen as unknown as typeof MONTHS}
      />,
    );
    const chart = long.container.querySelector("[data-details-chart='trend']");
    expect(chart?.getAttribute("data-trend-labels")).toBe("edges");
    expect(bars(long.container)).toHaveLength(13);
    expect(chart?.textContent).toContain("2025年9月");
    expect(chart?.textContent).toContain("2026年9月");
    expect(chart?.textContent).not.toContain("10月");
  });
});
