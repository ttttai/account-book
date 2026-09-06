import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AnalyticsCategoryChart,
  type AnalyticsCategoryChartItem,
} from "./analytics-category-chart";

const ITEMS: readonly AnalyticsCategoryChartItem[] = [
  {
    key: "food",
    name: "食費",
    color: "food",
    amountMinor: 6000,
    sharePercent: 60,
  },
  {
    key: "home",
    name: "住居",
    color: "home",
    amountMinor: 3000,
    sharePercent: 30,
  },
  {
    key: "others",
    name: "その他のカテゴリ",
    amountMinor: 1000,
    sharePercent: 10,
    note: "2件",
  },
];

function renderChart(items: readonly AnalyticsCategoryChartItem[] = ITEMS) {
  return render(
    <AnalyticsCategoryChart
      heading="支出カテゴリ"
      items={items}
      listLabel="支出カテゴリの内訳"
    />,
  );
}

function rowTexts(): string[] {
  const list = screen.getByRole("list", { name: "支出カテゴリの内訳" });
  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");
}

afterEach(() => {
  cleanup();
});

describe("AnalyticsCategoryChart", () => {
  it("初期表示は円グラフで、扇形は金額のある項目だけをカテゴリ色tokenで描く (AC-ANA-014-1、AC-ANA-014-2)", () => {
    const { container } = renderChart();

    expect(
      container.querySelector('[data-analytics-chart="pie"]'),
    ).not.toBeNull();
    const pie = container.querySelector("[data-analytics-pie]");
    expect(pie?.getAttribute("aria-hidden")).toBe("true");
    const slices = container.querySelectorAll("[data-analytics-slice]");
    expect(slices).toHaveLength(3);
    expect(slices[0]?.getAttribute("data-category-color")).toBe("food");
    expect(slices[0]?.getAttribute("data-analytics-slice")).toBe("category");
    // 「その他のカテゴリ」はカテゴリ色ではなく中立色の扇形にする
    expect(slices[2]?.getAttribute("data-analytics-slice")).toBe("others");
    expect(slices[2]?.hasAttribute("data-category-color")).toBe(false);
    for (const slice of slices) {
      expect(slice.getAttribute("d")).toMatch(/^M [\d. ]+A /);
      expect(slice.getAttribute("d")).not.toMatch(/NaN/);
    }
    // 円グラフでは横棒を描かない
    expect(container.querySelector("[data-analytics-bar]")).toBeNull();

    const toggle = screen.getByRole("group", {
      name: "支出カテゴリの表示形式",
    });
    expect(
      within(toggle)
        .getByRole("button", { name: "円グラフ" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(toggle)
        .getByRole("button", { name: "棒グラフ" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("一覧はどちらの形式でも同じ順序で名称・色の印・金額・構成比・件数を示す (AC-ANA-014-3)", () => {
    const { container } = renderChart();

    const pieRows = rowTexts();
    expect(pieRows).toHaveLength(3);
    expect(pieRows[0]).toContain("食費");
    expect(pieRows[0]).toContain("￥6,000");
    expect(pieRows[0]).toContain("60%");
    expect(pieRows[2]).toContain("その他のカテゴリ");
    expect(pieRows[2]).toContain("￥1,000");
    expect(pieRows[2]).toContain("2件");
    const dots = container.querySelectorAll("[data-category-dot]");
    expect(dots).toHaveLength(3);
    expect(dots[0]?.getAttribute("data-category-color")).toBe("food");
    expect(dots[0]?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "棒グラフ" }));

    expect(rowTexts()).toEqual(pieRows);
    expect(container.querySelectorAll("[data-category-dot]")).toHaveLength(3);
  });

  it("「棒グラフ」で横棒へ即時に切り替わり、リンク遷移やformを使わない (AC-ANA-014-1)", () => {
    const { container } = renderChart();

    const toggle = screen.getByRole("group", {
      name: "支出カテゴリの表示形式",
    });
    expect(toggle.querySelector("a, form")).toBeNull();

    fireEvent.click(within(toggle).getByRole("button", { name: "棒グラフ" }));

    expect(
      container.querySelector('[data-analytics-chart="bar"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-analytics-pie]")).toBeNull();
    const bars = container.querySelectorAll("[data-analytics-bar]");
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
    }
    expect(bars[0]?.getAttribute("data-category-color")).toBe("food");
    expect((bars[0] as HTMLElement).style.width).toBe("60%");
    expect(
      within(toggle)
        .getByRole("button", { name: "棒グラフ" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(toggle)
        .getByRole("button", { name: "円グラフ" })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(within(toggle).getByRole("button", { name: "円グラフ" }));

    expect(container.querySelector("[data-analytics-pie]")).not.toBeNull();
    expect(container.querySelector("[data-analytics-bar]")).toBeNull();
  });

  it("0円の項目は一覧に残しつつ扇形を持たず、1件だけなら全周を描く (AC-ANA-014-2)", () => {
    const { container } = renderChart([
      {
        key: "a",
        name: "食費",
        color: "food",
        amountMinor: 0,
        sharePercent: 0,
      },
      {
        key: "b",
        name: "住居",
        color: "home",
        amountMinor: 900,
        sharePercent: 100,
      },
    ]);

    expect(rowTexts()).toHaveLength(2);
    const slices = container.querySelectorAll("[data-analytics-slice]");
    expect(slices).toHaveLength(1);
    expect(slices[0]?.getAttribute("data-category-color")).toBe("home");
  });

  it("見出しを表示する", () => {
    renderChart();

    expect(
      screen.getByRole("heading", { level: 3, name: "支出カテゴリ" }),
    ).toBeTruthy();
  });
});
