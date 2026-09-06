import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { BudgetViewReady } from "../application/budget-types";
import { BudgetOverview, BudgetValidationError } from "./budget-overview";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";

function createView(overrides: Partial<BudgetViewReady> = {}): BudgetViewReady {
  return {
    kind: "ready",
    group: { id: GROUP_ID, name: "わが家" },
    month: "2026-09",
    previousMonth: "2026-08",
    nextMonth: "2026-10",
    currentMonth: "2026-09",
    canManage: true,
    canEditMonth: true,
    appliedRevision: {
      effectiveMonth: "2026-06",
      status: "active",
      version: 2,
    },
    revisionAtMonth: null,
    progress: {
      effectiveMonth: "2026-06",
      version: 2,
      limitMinor: 300000,
      usedMinor: 250000,
      remainingMinor: 50000,
      usedPercent: 83,
      status: "warn",
      unallocatedMinor: 140000,
      categories: [
        {
          categoryId: FOOD,
          name: "食費",
          color: "food",
          limitMinor: 60000,
          usedMinor: 50000,
          remainingMinor: 10000,
          usedPercent: 83,
          status: "warn",
        },
        {
          categoryId: HOME,
          name: "住居",
          color: "home",
          limitMinor: 100000,
          usedMinor: 110000,
          remainingMinor: -10000,
          usedPercent: 110,
          status: "over",
        },
      ],
    },
    history: [
      { effectiveMonth: "2027-01", status: "disabled", totalAmountMinor: null },
      { effectiveMonth: "2026-06", status: "active", totalAmountMinor: 300000 },
    ],
    expenseCategories: [
      { id: FOOD, name: "食費", color: "food" },
      { id: HOME, name: "住居", color: "home" },
    ],
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("BudgetOverview", () => {
  it("グループ予算・実績・残額・消化率・状態ラベルを文字で表示する (AC-BUD-003-1、AC-BUD-007-1)", () => {
    render(<BudgetOverview view={createView()} />);

    const summary = screen.getByRole("region", { name: "グループ予算" });
    expect(within(summary).getByText("￥300,000")).toBeTruthy();
    expect(within(summary).getByText("￥250,000")).toBeTruthy();
    expect(within(summary).getByText("￥50,000")).toBeTruthy();
    expect(within(summary).getByText("83%")).toBeTruthy();
    expect(within(summary).getByText("注意")).toBeTruthy();
    expect(within(summary).getByText(/2026年6月から適用/)).toBeTruthy();
    // 進捗バーは装飾であり、読み上げ対象にしない
    const bar = summary.querySelector("[data-budget-bar]");
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
  });

  it("カテゴリ内訳を縦一覧で表示し、超過は超過額として明示する (AC-BUD-007-2、AC-BUD-010-2)", () => {
    render(<BudgetOverview view={createView()} />);

    const list = screen.getByRole("list", { name: "カテゴリ別予算" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("食費")).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText("注意")).toBeTruthy();
    expect(
      within(items[1] as HTMLElement).getByText("超過 ￥10,000"),
    ).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("110%")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("超過")).toBeTruthy();
    expect(screen.getByText(/未配分 ￥140,000/)).toBeTruthy();
    // 横スクロールする表を使わない
    expect(list.tagName).toBe("UL");
    expect(document.querySelector("table")).toBeNull();
  });

  it("グループ予算の超過は残額の代わりに超過額を表示する (AC-BUD-008-1)", () => {
    const view = createView();
    render(
      <BudgetOverview
        view={createView({
          progress: view.progress
            ? {
                ...view.progress,
                usedMinor: 301000,
                remainingMinor: -1000,
                usedPercent: 100,
                status: "over",
              }
            : null,
        })}
      />,
    );

    const summary = screen.getByRole("region", { name: "グループ予算" });
    expect(within(summary).getByText("超過 ￥1,000")).toBeTruthy();
    expect(within(summary).getByText("超過")).toBeTruthy();
    expect(within(summary).getByText("100%")).toBeTruthy();
  });

  it("前月・翌月リンクは月をURLへ保持する", () => {
    render(<BudgetOverview view={createView()} />);

    expect(
      screen
        .getByRole("link", { name: "2026年8月を表示" })
        .getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/budgets?month=2026-08`);
    expect(
      screen
        .getByRole("link", { name: "2026年10月を表示" })
        .getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/budgets?month=2026-10`);
    expect(screen.getByRole("heading", { name: "2026年9月" })).toBeTruthy();
  });

  it("改定履歴を新しい順に表示し、停止改定は停止と示す (AC-BUD-006-1)", () => {
    render(<BudgetOverview view={createView()} />);

    const history = screen.getByRole("region", { name: "改定履歴" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows[0]?.textContent).toContain("2027年1月から");
    expect(rows[0]?.textContent).toContain("停止");
    expect(rows[1]?.textContent).toContain("2026年6月から");
    expect(rows[1]?.textContent).toContain("￥300,000");
  });

  it("予算未設定の月は説明を表示し、金額領域を出さない (AC-BUD-003-2)", () => {
    render(
      <BudgetOverview
        view={createView({
          progress: null,
          appliedRevision: null,
          history: [],
        })}
      />,
    );

    expect(
      screen.getByText("この月には予算が設定されていません。"),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "グループ予算" })).toBeNull();
    expect(screen.queryByRole("list", { name: "カテゴリ別予算" })).toBeNull();
  });
});

describe("BudgetValidationError", () => {
  it("不正な月では当月へ戻る導線だけを表示する (AC-BUD-003-2)", () => {
    render(
      <BudgetValidationError
        data={{
          kind: "invalid",
          groupId: GROUP_ID,
          currentMonth: "2026-09",
          reason: "invalid_month",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "今月の予算へ戻る" })
        .getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/budgets?month=2026-09`);
  });
});
