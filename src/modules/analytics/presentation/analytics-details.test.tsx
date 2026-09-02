import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("空期間は0円の各月と説明を表示し、member対象ではメンバー比較を隠す", () => {
    render(
      <AnalyticsDetails
        data={createData({
          scope: "self",
          memberBreakdown: [],
          hasTransactions: false,
        })}
      />,
    );
    expect(screen.getByText("この期間の取引はまだありません。")).toBeTruthy();
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
