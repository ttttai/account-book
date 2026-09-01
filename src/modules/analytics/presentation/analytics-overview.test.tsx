import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AnalyticsOverviewReady } from "../application/analytics-types";
import {
  AnalyticsOverview,
  AnalyticsValidationError,
} from "./analytics-overview";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";

function createData(
  overrides: Partial<AnalyticsOverviewReady> = {},
): AnalyticsOverviewReady {
  return {
    kind: "ready",
    group: { id: GROUP_ID, name: "わが家" },
    month: "2026-09",
    previousMonth: "2026-08",
    nextMonth: "2026-10",
    currentMonth: "2026-09",
    scope: "group",
    members: [
      {
        membershipId: "40000000-0000-4000-8000-00000000000a",
        displayName: "利用者A",
        isCurrentUser: true,
      },
      {
        membershipId: MEMBER_B,
        displayName: "利用者B",
        isCurrentUser: false,
      },
    ],
    totals: { expenseTotal: 11000, incomeTotal: 300000, balance: 289000 },
    previousTotals: {
      expenseTotal: 10000,
      incomeTotal: 200000,
      balance: 190000,
    },
    expenseComparison: { diffMinor: 1000, changePercent: 10 },
    incomeComparison: { diffMinor: 100000, changePercent: 50 },
    balanceDiffMinor: 99000,
    categoryBreakdown: {
      top: [
        {
          categoryId: "30000000-0000-4000-8000-000000000001",
          name: "食費",
          color: "food",
          amountMinor: 6000,
          sharePercent: 55,
        },
        {
          categoryId: "30000000-0000-4000-8000-000000000002",
          name: "住居",
          color: "home",
          amountMinor: 4000,
          sharePercent: 36,
        },
      ],
      others: { amountMinor: 1000, categoryCount: 2, sharePercent: 9 },
    },
    hasTransactions: true,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("AnalyticsOverview", () => {
  it("支出・収入・収支を正確な金額と符号で表示する (AC-ANA-002-2)", () => {
    render(<AnalyticsOverview data={createData()} />);

    const expense = screen.getByRole("group", { name: "支出" });
    const income = screen.getByRole("group", { name: "収入" });
    const balance = screen.getByRole("group", { name: "収支" });

    expect(within(expense).getByText("￥11,000")).toBeTruthy();
    expect(within(income).getByText("￥300,000")).toBeTruthy();
    expect(within(balance).getByText("＋￥289,000")).toBeTruthy();
  });

  it("前月との差額と前月比をテキストで併記する (AC-ANA-003-2)", () => {
    render(<AnalyticsOverview data={createData()} />);

    const expense = screen.getByRole("group", { name: "支出" });

    expect(within(expense).getByText(/前月比/)).toBeTruthy();
    expect(within(expense).getByText(/＋￥1,000/)).toBeTruthy();
    expect(within(expense).getByText(/＋10%/)).toBeTruthy();
  });

  it("前月0円では比率を出さず「比較なし」を表示する (AC-ANA-003-1)", () => {
    render(
      <AnalyticsOverview
        data={createData({
          previousTotals: { expenseTotal: 0, incomeTotal: 0, balance: 0 },
          expenseComparison: { diffMinor: 11000, changePercent: null },
          incomeComparison: { diffMinor: 300000, changePercent: null },
          balanceDiffMinor: 289000,
        })}
      />,
    );

    const expense = screen.getByRole("group", { name: "支出" });

    expect(within(expense).getByText(/比較なし/)).toBeTruthy();
    expect(within(expense).queryByText(/%/)).toBeNull();
  });

  it("カテゴリ内訳をグラフなしでも読める名称・金額・構成比で表示する (AC-ANA-009-1)", () => {
    const { container } = render(<AnalyticsOverview data={createData()} />);

    const breakdown = screen.getByRole("list", { name: "支出カテゴリの内訳" });
    const rows = within(breakdown).getAllByRole("listitem");

    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("食費");
    expect(rows[0]?.textContent).toContain("￥6,000");
    expect(rows[0]?.textContent).toContain("55%");
    expect(rows[2]?.textContent).toContain("その他のカテゴリ");
    expect(rows[2]?.textContent).toContain("￥1,000");
    expect(rows[2]?.textContent).toContain("2件");
    // 棒は装飾であり、値の唯一の伝達手段にしない
    for (const bar of container.querySelectorAll("[data-analytics-bar]")) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("取引が無い月は0円の指標と空状態の説明を表示する", () => {
    render(
      <AnalyticsOverview
        data={createData({
          totals: { expenseTotal: 0, incomeTotal: 0, balance: 0 },
          previousTotals: { expenseTotal: 0, incomeTotal: 0, balance: 0 },
          expenseComparison: { diffMinor: 0, changePercent: null },
          incomeComparison: { diffMinor: 0, changePercent: null },
          balanceDiffMinor: 0,
          categoryBreakdown: { top: [] },
          hasTransactions: false,
        })}
      />,
    );

    expect(screen.getByText("この月の取引はまだありません。")).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "支出" })).getByText("￥0"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("list", { name: "支出カテゴリの内訳" }),
    ).toBeNull();
  });

  it("予算値がない月は予算進捗を表示せず、ある月だけ表示する (AC-ANA-011-1)", () => {
    render(<AnalyticsOverview data={createData()} />);
    expect(screen.queryByRole("group", { name: "予算" })).toBeNull();
    cleanup();

    render(
      <AnalyticsOverview
        data={createData({
          budget: {
            limitMinor: 20000,
            usedMinor: 11000,
            remainingMinor: 9000,
            usedPercent: 55,
          },
        })}
      />,
    );

    const budget = screen.getByRole("group", { name: "予算" });
    expect(within(budget).getByText(/￥20,000/)).toBeTruthy();
    expect(within(budget).getByText(/￥9,000/)).toBeTruthy();
    expect(within(budget).getByText(/55%/)).toBeTruthy();
  });

  it("月移動と集計対象の切替が月・scopeをURLへ保持する (AC-ANA-005-1)", () => {
    render(<AnalyticsOverview data={createData({ scope: "self" })} />);

    const base = `/groups/${GROUP_ID}/analytics`;
    expect(
      screen
        .getByRole("link", { name: "2026年8月を表示" })
        .getAttribute("href"),
    ).toBe(`${base}?month=2026-08&scope=self`);
    expect(
      screen
        .getByRole("link", { name: "2026年10月を表示" })
        .getAttribute("href"),
    ).toBe(`${base}?month=2026-10&scope=self`);
    expect(
      screen.getByRole("link", { name: "グループ" }).getAttribute("href"),
    ).toBe(`${base}?month=2026-09&scope=group`);
    expect(
      screen.getByRole("link", { name: "利用者B" }).getAttribute("href"),
    ).toBe(`${base}?month=2026-09&scope=member&member=${MEMBER_B}`);
    expect(
      screen.getByRole("link", { name: "自分" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("ホームカレンダーと履歴へ同じ月で移動できる", () => {
    render(<AnalyticsOverview data={createData()} />);

    expect(
      screen.getByRole("link", { name: /カレンダー/ }).getAttribute("href"),
    ).toContain("month=2026-09");
    expect(
      screen.getByRole("link", { name: /履歴/ }).getAttribute("href"),
    ).toContain("month=2026-09");
  });
});

describe("AnalyticsValidationError", () => {
  it("取引を読まずに当月表示へ戻る導線だけを示す (AC-ANA-005-2)", () => {
    render(
      <AnalyticsValidationError
        data={{
          kind: "invalid",
          groupId: GROUP_ID,
          currentMonth: "2026-09",
          reason: "invalid_member",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /今月/ }).getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/analytics?month=2026-09&scope=group`);
  });
});
