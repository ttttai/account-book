import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AnalyticsDetailsReady } from "../application/analytics-types";
import {
  AnalyticsDetails,
  AnalyticsDetailsValidationError,
} from "./analytics-details";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_A = "40000000-0000-4000-8000-00000000000a";

function createData(
  overrides: Partial<AnalyticsDetailsReady> = {},
): AnalyticsDetailsReady {
  return {
    kind: "ready",
    group: { id: GROUP_ID, name: "わが家" },
    currentMonth: "2026-09",
    startMonth: "2026-08",
    endMonth: "2026-09",
    scope: "group",
    members: [
      { membershipId: MEMBER_A, displayName: "利用者A", isCurrentUser: true },
    ],
    months: [
      {
        month: "2026-08",
        expenseTotal: 10000,
        incomeTotal: 20000,
        balance: 10000,
        expenseByCategory: [],
      },
      {
        month: "2026-09",
        expenseTotal: 11000,
        incomeTotal: 5000,
        balance: -6000,
        expenseByCategory: [],
      },
    ],
    period: {
      expenseTotal: 21000,
      incomeTotal: 25000,
      balance: 4000,
      averageExpense: 10500,
      highestExpenseMonth: "2026-09",
      expenseByCategory: [
        {
          categoryId: "food",
          name: "食費",
          color: "food",
          amountMinor: 13000,
          sharePercent: 62,
        },
        {
          categoryId: "home",
          name: "住居",
          color: "home",
          amountMinor: 8000,
          sharePercent: 38,
        },
      ],
    },
    memberBreakdown: [
      {
        membershipId: MEMBER_A,
        displayName: "利用者A",
        usageTotal: 21000,
        paidTotal: 18000,
        receivedTotal: 25000,
      },
    ],
    cumulativeBalances: [
      { month: "2026-08", balance: 10000, cumulativeBalance: 10000 },
      { month: "2026-09", balance: -6000, cumulativeBalance: 4000 },
    ],
    hasTransactions: true,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("AnalyticsDetails", () => {
  it("期間指標と追加統計を正確なテキストで表示する (AC-ANA-008-1、2)", () => {
    render(<AnalyticsDetails data={createData()} />);

    expect(
      within(screen.getByRole("group", { name: "期間の支出" })).getByText(
        "￥21,000",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "期間の収入" })).getByText(
        "￥25,000",
      ),
    ).toBeTruthy();
    expect(screen.getByText("月平均 ￥10,500")).toBeTruthy();
    expect(screen.getByText(/最大支出月 2026年9月/)).toBeTruthy();
  });

  it("月別推移、カテゴリ、メンバー3系列をグラフなしでも読める (AC-ANA-008-3、4、AC-ANA-009-4)", () => {
    const { container } = render(<AnalyticsDetails data={createData()} />);

    const table = screen.getByRole("table", { name: "月別の正確な数値" });
    expect(within(table).getByText("2026年8月")).toBeTruthy();
    expect(within(table).getByText("−￥6,000")).toBeTruthy();
    const categories = screen.getByRole("list", { name: "期間の支出カテゴリ" });
    expect(categories.textContent).toContain("食費");
    expect(categories.textContent).toContain("￥13,000");
    // カテゴリ構成は既定で円グラフ。切替で横棒へ変わり一覧は同じ (AC-ANA-014-1、AC-ANA-014-3)
    expect(
      container
        .querySelector("[data-analytics-pie]")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(container.querySelector("[data-analytics-bar]")).toBeNull();
    const categoryRows = within(categories)
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "支出カテゴリの表示形式" }),
      ).getByRole("button", { name: "棒グラフ" }),
    );
    expect(container.querySelector("[data-analytics-pie]")).toBeNull();
    expect(container.querySelectorAll("[data-analytics-bar]")).toHaveLength(
      categoryRows.length,
    );
    expect(
      within(screen.getByRole("list", { name: "期間の支出カテゴリ" }))
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(categoryRows);
    const members = screen.getByRole("table", { name: "メンバー別の内訳" });
    expect(members.textContent).toContain("負担額");
    expect(members.textContent).toContain("支払額");
    expect(members.textContent).toContain("受取額");
    for (const bar of container.querySelectorAll("[data-details-bar]")) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("preset・GET form・概要への導線が期間と対象をURLへ保持する (AC-ANA-006-1、2)", () => {
    render(<AnalyticsDetails data={createData()} />);

    expect(
      screen.getByRole("link", { name: "3か月" }).getAttribute("href"),
    ).toContain("start=2026-07&end=2026-09");
    const form = screen.getByRole("form", { name: "詳細分析の表示条件" });
    expect(form.getAttribute("action")).toBe(
      `/groups/${GROUP_ID}/analytics/details`,
    );
    expect(
      screen.getByRole("link", { name: /概要分析/ }).getAttribute("href"),
    ).toContain("month=2026-09");
  });

  it("各金額にモバイル用項目名を持ち、表の見出しと重複して読み上げない (AC-ANA-009-6)", () => {
    render(<AnalyticsDetails data={createData()} />);

    for (const [name, labels, values] of [
      [
        "メンバー別の内訳",
        ["負担額", "支払額", "受取額"],
        ["￥21,000", "￥18,000", "￥25,000"],
      ],
      [
        "月別の正確な数値",
        ["支出", "収入", "収支", "累積収支"],
        ["￥10,000", "￥20,000", "＋￥10,000", "＋￥10,000"],
      ],
    ] as const) {
      const table = screen.getByRole("table", { name });
      const firstRow = within(table).getAllByRole("row")[1];
      const cells = within(firstRow).getAllByRole("cell");
      labels.forEach((label, index) => {
        expect(
          within(cells[index]).getByText(label).getAttribute("aria-hidden"),
        ).toBe("true");
        expect(within(cells[index]).getByText(values[index])).toBeTruthy();
        expect(cells[index].getAttribute("aria-label")).toBeNull();
        expect(
          within(table)
            .getByRole("columnheader", { name: label })
            .getAttribute("scope"),
        ).toBe("col");
      });
      expect(
        within(firstRow).getByRole("rowheader").getAttribute("scope"),
      ).toBe("row");
    }
  });

  it("貯金額の推移を装飾の棒グラフと数値表の累積収支列で示し、注記を表示する (AC-ANA-013-1〜3)", () => {
    const { container } = render(<AnalyticsDetails data={createData()} />);

    const section = screen.getByRole("region", { name: "貯金額の推移" });
    expect(within(section).getByText(/期間開始時を0円として計算/)).toBeTruthy();
    const chart = container.querySelector("[data-details-chart='savings']");
    expect(chart?.getAttribute("aria-hidden")).toBe("true");
    expect(chart?.querySelector("[data-chart-baseline]")).toBeTruthy();
    // 棒は月数と同じ本数で、正の値は基準線より上に先端を持つ
    const bars = chart?.querySelectorAll("[data-chart-bar]") ?? [];
    expect(bars).toHaveLength(2);
    expect(bars[0]?.getAttribute("data-chart-bar")).toBe("positive");
    expect(chart?.querySelector("svg polyline")).toBeNull();
    // 最大値・最小値・開始月・終了月は文字で添える
    expect(chart?.textContent).toContain("＋￥10,000");
    expect(chart?.textContent).toContain("±￥0");
    expect(chart?.textContent).toContain("2026年8月");
    expect(chart?.textContent).toContain("2026年9月");

    const table = screen.getByRole("table", { name: "月別の正確な数値" });
    expect(
      within(table)
        .getByRole("columnheader", { name: "累積収支" })
        .getAttribute("scope"),
    ).toBe("col");
    const lastRow = within(table).getAllByRole("row").at(-1);
    expect(lastRow?.textContent).toContain("＋￥4,000");

    // 赤字の月は色分け用の値を持つ。意味は向きと数値表の符号でも伝える
    cleanup();
    const negative = render(
      <AnalyticsDetails
        data={createData({
          cumulativeBalances: [
            { month: "2026-08", balance: 10000, cumulativeBalance: 10000 },
            { month: "2026-09", balance: -16000, cumulativeBalance: -6000 },
          ],
        })}
      />,
    );
    const negativeBars =
      negative.container.querySelectorAll("[data-chart-bar]");
    expect(negativeBars[1]?.getAttribute("data-chart-bar")).toBe("negative");
  });

  it("空期間は0円の各月と説明を表示し、member対象ではメンバー比較を隠す", () => {
    render(
      <AnalyticsDetails
        data={createData({
          scope: "self",
          memberBreakdown: [],
          cumulativeBalances: [
            { month: "2026-08", balance: 0, cumulativeBalance: 0 },
            { month: "2026-09", balance: 0, cumulativeBalance: 0 },
          ],
          hasTransactions: false,
        })}
      />,
    );
    expect(screen.getByText("この期間の取引はまだありません。")).toBeTruthy();
    expect(screen.getByRole("region", { name: "貯金額の推移" })).toBeTruthy();
    expect(
      screen.queryByRole("table", { name: "メンバー別の内訳" }),
    ).toBeNull();
    expect(
      screen.getByRole("table", { name: "月別の正確な数値" }),
    ).toBeTruthy();
  });
});

describe("AnalyticsDetailsValidationError", () => {
  it("既定6か月へ戻る導線だけを示す", () => {
    render(
      <AnalyticsDetailsValidationError
        data={{
          kind: "invalid",
          groupId: GROUP_ID,
          currentMonth: "2026-09",
          reason: "invalid_period",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /既定/ }).getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/analytics/details`);
  });
});
