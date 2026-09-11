import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AnalyticsOverviewReady } from "../application/analytics-types";
import {
  AnalyticsOverview,
  AnalyticsValidationError,
} from "./analytics-overview";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";
const MEMBER_C = "40000000-0000-4000-8000-00000000000c";
const MEMBER_D = "40000000-0000-4000-8000-00000000000d";
const SELF = {
  membershipId: "40000000-0000-4000-8000-00000000000a",
  displayName: "利用者A",
  isCurrentUser: true,
} as const;
const OTHERS = [
  { membershipId: MEMBER_B, displayName: "利用者B", isCurrentUser: false },
  { membershipId: MEMBER_C, displayName: "利用者C", isCurrentUser: false },
  {
    membershipId: MEMBER_D,
    displayName: "とても長い表示名を持つ利用者D",
    isCurrentUser: false,
  },
] as const;

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
    members: [SELF, OTHERS[0]],
    totals: { expenseTotal: 11000, incomeTotal: 300000, balance: 289000 },
    previousTotals: {
      expenseTotal: 10000,
      incomeTotal: 200000,
      balance: 190000,
    },
    expenseComparison: { diffMinor: 1000 },
    incomeComparison: { diffMinor: 100000 },
    balanceDiffMinor: 99000,
    // 7カテゴリ全件（合計は期間支出11,000円）。上位5件へ丸めない (AC-ANA-004-1)
    expenseByCategory: [
      ["食費", "food", 4000, 36],
      ["住居", "home", 3000, 27],
      ["交通", "transport", 1500, 14],
      ["光熱費", "utility", 1000, 9],
      ["通信", "communication", 700, 6],
      ["娯楽", "hobby", 500, 5],
      ["医療", "medical", 300, 3],
    ].map(([name, color, amountMinor, sharePercent], index) => ({
      categoryId: `30000000-0000-4000-8000-00000000000${index + 1}`,
      name: String(name),
      color: String(color),
      amountMinor: Number(amountMinor),
      sharePercent: Number(sharePercent),
    })),
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

  it("前月との差額だけをテキストで示し、比率を表示しない (AC-ANA-003-2)", () => {
    render(<AnalyticsOverview data={createData()} />);

    const expense = screen.getByRole("group", { name: "支出" });
    const income = screen.getByRole("group", { name: "収入" });
    const balance = screen.getByRole("group", { name: "収支" });

    expect(within(expense).getByText("前月比 ＋￥1,000")).toBeTruthy();
    expect(within(income).getByText("前月比 ＋￥100,000")).toBeTruthy();
    expect(within(balance).getByText("前月比 ＋￥99,000")).toBeTruthy();
    expect(within(expense).queryByText(/%/)).toBeNull();
    expect(within(income).queryByText(/%/)).toBeNull();
  });

  it("前月0円でも差額だけを表示し、「比較なし」を出さない (AC-ANA-003-1)", () => {
    render(
      <AnalyticsOverview
        data={createData({
          previousTotals: { expenseTotal: 0, incomeTotal: 0, balance: 0 },
          expenseComparison: { diffMinor: 11000 },
          incomeComparison: { diffMinor: 300000 },
          balanceDiffMinor: 289000,
        })}
      />,
    );

    const expense = screen.getByRole("group", { name: "支出" });

    expect(within(expense).getByText("前月比 ＋￥11,000")).toBeTruthy();
    expect(within(expense).queryByText(/比較なし/)).toBeNull();
    expect(within(expense).queryByText(/%/)).toBeNull();
  });

  it("カテゴリ内訳を全件、1カテゴリ1行の名称・金額・構成比で表示する (AC-ANA-004-1、AC-ANA-009-1、AC-ANA-014-4)", () => {
    const { container } = render(<AnalyticsOverview data={createData()} />);

    const breakdown = screen.getByRole("list", { name: "支出カテゴリの内訳" });
    const rows = within(breakdown).getAllByRole("listitem");

    // 7カテゴリを丸めずに全件表示し、「その他のカテゴリ」を作らない
    expect(rows).toHaveLength(7);
    expect(rows[0]?.textContent).toContain("食費");
    expect(rows[0]?.textContent).toContain("￥4,000");
    expect(rows[0]?.textContent).toContain("36%");
    expect(rows[6]?.textContent).toContain("医療");
    expect(rows[6]?.textContent).toContain("￥300");
    expect(rows[6]?.textContent).toContain("3%");
    expect(breakdown.textContent).not.toContain("その他のカテゴリ");
    // 名称・金額・構成比は同じ1行（1つの段落）に置き、構成比だけの行を作らない
    for (const row of rows) {
      const paragraphs = row.querySelectorAll("p");
      expect(paragraphs).toHaveLength(1);
      expect(paragraphs[0]?.textContent).toMatch(/￥[\d,]+\d+%$/);
    }
    // 既定は円グラフで、扇形は装飾。値の唯一の伝達手段にしない (AC-ANA-014-1)
    expect(
      container
        .querySelector("[data-analytics-pie]")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(container.querySelectorAll("[data-analytics-slice]")).toHaveLength(
      7,
    );
    expect(container.querySelector("[data-analytics-bar]")).toBeNull();
  });

  it("カテゴリ内訳を棒グラフへ切り替えても一覧の値と順序が変わらない (AC-ANA-014-1、AC-ANA-014-3)", () => {
    const { container } = render(<AnalyticsOverview data={createData()} />);
    const rowsBefore = within(
      screen.getByRole("list", { name: "支出カテゴリの内訳" }),
    )
      .getAllByRole("listitem")
      .map((row) => row.textContent);

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "支出カテゴリの表示形式" }),
      ).getByRole("button", { name: "棒グラフ" }),
    );

    expect(container.querySelector("[data-analytics-pie]")).toBeNull();
    const bars = container.querySelectorAll("[data-analytics-bar]");
    expect(bars).toHaveLength(7);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
    }
    expect(
      within(screen.getByRole("list", { name: "支出カテゴリの内訳" }))
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(rowsBefore);
  });

  it("取引が無い月は0円の指標と空状態の説明を表示する", () => {
    render(
      <AnalyticsOverview
        data={createData({
          totals: { expenseTotal: 0, incomeTotal: 0, balance: 0 },
          previousTotals: { expenseTotal: 0, incomeTotal: 0, balance: 0 },
          expenseComparison: { diffMinor: 0 },
          incomeComparison: { diffMinor: 0 },
          balanceDiffMinor: 0,
          expenseByCategory: [],
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
    // 空状態ではグラフも切替も表示しない
    expect(
      screen.queryByRole("group", { name: "支出カテゴリの表示形式" }),
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
            status: "ok",
            statusLabel: "順調",
          },
        })}
      />,
    );

    const budget = screen.getByRole("group", { name: "予算" });
    expect(within(budget).getByText(/￥20,000/)).toBeTruthy();
    expect(within(budget).getByText(/￥11,000/)).toBeTruthy();
    expect(within(budget).getByText(/￥9,000/)).toBeTruthy();
    expect(within(budget).getByText(/55%/)).toBeTruthy();
    expect(within(budget).getByText("順調")).toBeTruthy();
    // 同じ月の予算画面へ遷移できる (AC-BUD-010-1)
    expect(
      within(budget)
        .getByRole("link", { name: "予算の詳細を見る" })
        .getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/budgets?month=2026-09`);
  });

  it("予算超過は超過額と状態ラベルで示す (AC-BUD-007-2)", () => {
    render(
      <AnalyticsOverview
        data={createData({
          budget: {
            limitMinor: 10000,
            usedMinor: 11000,
            remainingMinor: -1000,
            usedPercent: 110,
            status: "over",
            statusLabel: "超過",
          },
        })}
      />,
    );

    const budget = screen.getByRole("group", { name: "予算" });
    expect(within(budget).getByText(/超過 ￥1,000/)).toBeTruthy();
    expect(within(budget).getByText("超過")).toBeTruthy();
    expect(within(budget).getByText(/110%/)).toBeTruthy();
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

  it("自分以外のアクティブメンバーが0人なら「グループ」「自分」の2枠だけを表示する (AC-ANA-005-3)", () => {
    const { container } = render(
      <AnalyticsOverview data={createData({ members: [SELF] })} />,
    );

    const nav = screen.getByRole("navigation", { name: "分析の集計対象" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["グループ", "自分"]);
    expect(within(nav).queryByText("メンバー")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
  });

  it("自分以外が1人ならそのメンバー名を3枠目の直接リンクにし、選択欄を出さない (AC-ANA-005-3)", () => {
    const { container } = render(<AnalyticsOverview data={createData()} />);

    const nav = screen.getByRole("navigation", { name: "分析の集計対象" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["グループ", "自分", "利用者B"]);
    expect(container.querySelector("details")).toBeNull();
  });

  it("自分以外が2人以上なら「メンバー」選択欄に自分以外の候補だけを並べる (AC-ANA-005-3, AC-ANA-005-4)", () => {
    const { container } = render(
      <AnalyticsOverview data={createData({ members: [SELF, ...OTHERS] })} />,
    );

    const nav = screen.getByRole("navigation", { name: "分析の集計対象" });
    // 枠は「グループ」「自分」「メンバー」の3つで、メンバー名を直接リンクとして並べない
    const picker = container.querySelector("details");
    expect(picker).not.toBeNull();
    expect(picker?.querySelector("summary")?.textContent).toBe("メンバー");
    expect(picker?.hasAttribute("open")).toBe(false);
    const topLevelLinks = Array.from(nav.children).filter(
      (child) => child.tagName === "A",
    );
    expect(topLevelLinks.map((l) => l.textContent)).toEqual([
      "グループ",
      "自分",
    ]);

    const base = `/groups/${GROUP_ID}/analytics`;
    const options = within(picker as HTMLElement).getAllByRole("link");
    expect(options.map((l) => l.textContent)).toEqual([
      "利用者B",
      "利用者C",
      "とても長い表示名を持つ利用者D",
    ]);
    expect(options[0]?.getAttribute("href")).toBe(
      `${base}?month=2026-09&scope=member&member=${MEMBER_B}`,
    );
    expect(options[2]?.getAttribute("href")).toBe(
      `${base}?month=2026-09&scope=member&member=${MEMBER_D}`,
    );
    for (const option of options) {
      expect(option.getAttribute("aria-current")).toBeNull();
    }
  });

  it("選択中のメンバーを枠へ表示し、候補と枠をaria-currentで示す (AC-ANA-005-4)", () => {
    const { container } = render(
      <AnalyticsOverview
        data={createData({
          members: [SELF, ...OTHERS],
          scope: "member",
          selectedMemberId: MEMBER_C,
          selectedMemberLabel: "利用者C",
        })}
      />,
    );

    const picker = container.querySelector("details");
    const summary = picker?.querySelector("summary");
    expect(summary?.textContent).toBe("利用者C");
    expect(summary?.classList.contains("is-active")).toBe(true);
    // 選択後も開いたままにせず、候補一覧が指標を覆わない (R-062と同じ規則)
    expect(picker?.hasAttribute("open")).toBe(false);

    const selected = within(picker as HTMLElement).getByRole("link", {
      name: "利用者C",
    });
    expect(selected.getAttribute("aria-current")).toBe("page");
    expect(
      within(picker as HTMLElement)
        .getByRole("link", { name: "利用者B" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "自分" }).getAttribute("aria-current"),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "グループ" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("2人以上でscope=memberに自分を指定した場合は「自分」枠を選択状態にし、選択欄は既定表示に戻す (AC-ANA-005-4)", () => {
    const { container } = render(
      <AnalyticsOverview
        data={createData({
          members: [SELF, ...OTHERS],
          scope: "member",
          selectedMemberId: SELF.membershipId,
          selectedMemberLabel: "利用者A",
        })}
      />,
    );

    expect(
      screen.getByRole("link", { name: "自分" }).getAttribute("aria-current"),
    ).toBe("page");
    const summary = container.querySelector("details > summary");
    expect(summary?.textContent).toBe("メンバー");
    expect(summary?.classList.contains("is-active")).toBe(false);
  });

  it("月移動は選択欄で選んだメンバーをURLへ保持する (AC-ANA-005-1)", () => {
    render(
      <AnalyticsOverview
        data={createData({
          members: [SELF, ...OTHERS],
          scope: "member",
          selectedMemberId: MEMBER_D,
          selectedMemberLabel: "とても長い表示名を持つ利用者D",
        })}
      />,
    );

    const base = `/groups/${GROUP_ID}/analytics`;
    expect(
      screen
        .getByRole("link", { name: "2026年8月を表示" })
        .getAttribute("href"),
    ).toBe(`${base}?month=2026-08&scope=member&member=${MEMBER_D}`);
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
