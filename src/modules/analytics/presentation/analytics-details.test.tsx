import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsDetailsReady } from "../application/analytics-types";
import type { AnalyticsMonthTotals } from "../domain/analytics-summary";
import { applyAnalyticsDetailsFilterAction } from "./actions";
import { AnalyticsDetailsValidationError } from "./analytics-details";
import { AnalyticsDetails } from "./analytics-details-view";

vi.mock("./actions", () => ({
  applyAnalyticsDetailsFilterAction: vi.fn(),
}));

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_A = "40000000-0000-4000-8000-00000000000a";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";
const detailsPath = `/groups/${GROUP_ID}/analytics/details`;

function createMonth(
  month: string,
  expenseTotal: number,
  incomeTotal: number,
): AnalyticsMonthTotals {
  return {
    month,
    expenseTotal,
    incomeTotal,
    balance: incomeTotal - expenseTotal,
    expenseByCategory: [],
  };
}

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
      { membershipId: MEMBER_B, displayName: "利用者B", isCurrentUser: false },
    ],
    months: [
      createMonth("2026-08", 10000, 20000),
      createMonth("2026-09", 11000, 5000),
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

// 3か月presetの結果に相当するDTO。見出しの月数が行数と同じ3になる
function createThreeMonthData(): AnalyticsDetailsReady {
  return createData({
    startMonth: "2026-07",
    months: [
      createMonth("2026-07", 0, 0),
      createMonth("2026-08", 10000, 20000),
      createMonth("2026-09", 11000, 5000),
    ],
    cumulativeBalances: [
      { month: "2026-07", balance: 0, cumulativeBalance: 0 },
      { month: "2026-08", balance: 10000, cumulativeBalance: 10000 },
      { month: "2026-09", balance: -6000, cumulativeBalance: 4000 },
    ],
  });
}

function currentSearch(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function results(): HTMLElement {
  const element = document.querySelector("[data-details-results]");
  if (!(element instanceof HTMLElement)) throw new Error("results missing");
  return element;
}

beforeEach(() => {
  vi.mocked(applyAnalyticsDetailsFilterAction).mockReset();
  window.history.replaceState(null, "", detailsPath);
});

afterEach(() => cleanup());

describe("AnalyticsDetails", () => {
  it("期間指標の見出しは月数を含み、追加統計を正確なテキストで表示する (AC-ANA-008-1、2、5)", () => {
    render(<AnalyticsDetails data={createData()} />);

    expect(
      within(screen.getByRole("group", { name: "2か月の支出" })).getByText(
        "￥21,000",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "2か月の収入" })).getByText(
        "￥25,000",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "2か月の収支" })).getByText(
        "＋￥4,000",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "期間の支出" })).toBeNull();
    expect(screen.getByText("月平均 ￥10,500")).toBeTruthy();
    expect(screen.getByText(/最大支出月 2026年9月/)).toBeTruthy();
  });

  it("月別推移、カテゴリ、メンバー別をグラフなしでも読める (AC-ANA-008-3、4、AC-ANA-009-4)", () => {
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
    // メンバー別表は支出額・受取額の2列とし、支払額と「負担」の語を表示しない (AC-TXN-018-4)
    const members = screen.getByRole("table", { name: "メンバー別の内訳" });
    expect(members.textContent).toContain("支出額");
    expect(members.textContent).toContain("受取額");
    expect(members.textContent).not.toContain("支払額");
    expect(members.textContent).not.toContain("負担");
    expect(members.textContent).not.toContain("￥18,000");
    expect(within(members).getAllByRole("columnheader")).toHaveLength(3);
    for (const bar of container.querySelectorAll("[data-details-bar]")) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("preset・表示条件・概要への導線が期間と対象をURL形で持ち、適用ボタンを置かない (AC-ANA-006-1、2、AC-ANA-016-1)", () => {
    render(<AnalyticsDetails data={createData()} />);

    expect(
      screen.getByRole("link", { name: "3か月" }).getAttribute("href"),
    ).toContain("start=2026-07&end=2026-09&scope=group");
    const form = screen.getByRole("form", { name: "詳細分析の表示条件" });
    expect(form.getAttribute("action")).toBeNull();
    expect(within(form).queryByRole("button", { name: "表示する" })).toBeNull();
    expect(screen.queryByText(/メンバーを「選択しない」/)).toBeNull();
    expect(within(form).queryByLabelText("メンバー")).toBeNull();
    expect(
      screen.getByRole("link", { name: /概要分析/ }).getAttribute("href"),
    ).toContain("month=2026-09");
  });

  it("月別表は列見出しを隠さず補助ラベルを持たず、メンバー別表だけがモバイル用項目名を持つ (AC-ANA-009-6)", () => {
    render(<AnalyticsDetails data={createData()} />);

    const months = screen.getByRole("table", { name: "月別の正確な数値" });
    for (const label of ["月", "支出", "収入", "収支", "累積収支"]) {
      expect(
        within(months)
          .getByRole("columnheader", { name: label })
          .getAttribute("scope"),
      ).toBe("col");
    }
    const monthRow = within(months).getAllByRole("row")[1];
    expect(within(monthRow).getByRole("rowheader").getAttribute("scope")).toBe(
      "row",
    );
    const monthCells = within(monthRow).getAllByRole("cell");
    expect(monthCells.map((cell) => cell.textContent)).toEqual([
      "￥10,000",
      "￥20,000",
      "＋￥10,000",
      "＋￥10,000",
    ]);
    expect(months.querySelectorAll("[aria-hidden='true']")).toHaveLength(0);
    // 表が幅を超えたときに内側だけをscrollさせる領域で包む
    expect(months.parentElement?.className).toContain("details-table-scroll");

    const members = screen.getByRole("table", { name: "メンバー別の内訳" });
    const memberRow = within(members).getAllByRole("row")[1];
    const memberCells = within(memberRow).getAllByRole("cell");
    [
      ["支出額", "￥21,000"],
      ["受取額", "￥25,000"],
    ].forEach(([label, value], index) => {
      expect(
        within(memberCells[index]).getByText(label).getAttribute("aria-hidden"),
      ).toBe("true");
      expect(within(memberCells[index]).getByText(value)).toBeTruthy();
      expect(memberCells[index].getAttribute("aria-label")).toBeNull();
      expect(
        within(members)
          .getByRole("columnheader", { name: label })
          .getAttribute("scope"),
      ).toBe("col");
    });
    expect(within(memberRow).getByRole("rowheader").getAttribute("scope")).toBe(
      "row",
    );
  });

  it("presetのタップはページ遷移せず、結果だけを取得してURLへpushStateし、見出しの月数を更新する (AC-ANA-016-1、2、AC-ANA-008-5)", async () => {
    let resolveApply: (value: {
      status: "ready";
      data: AnalyticsDetailsReady;
    }) => void = () => {};
    vi.mocked(applyAnalyticsDetailsFilterAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    const pushState = vi.spyOn(window.history, "pushState");
    render(<AnalyticsDetails data={createData()} />);
    const heading = screen.getByRole("heading", { level: 2 });
    const form = screen.getByRole("form", { name: "詳細分析の表示条件" });
    const region = results();

    const clickEvent = fireEvent.click(
      screen.getByRole("link", { name: "3か月" }),
    );

    // 修飾キーなしのクリックはアプリ内で処理し、ブラウザ遷移を止める
    expect(clickEvent).toBe(false);
    expect(window.location.pathname).toBe(detailsPath);
    expect(currentSearch().get("start")).toBe("2026-07");
    expect(currentSearch().get("end")).toBe("2026-09");
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(applyAnalyticsDetailsFilterAction).toHaveBeenCalledWith(GROUP_ID, {
      start: "2026-07",
      end: "2026-09",
      scope: "group",
    });
    // 反映中は結果領域だけが待機表示になり、見出し・表示条件は同じ要素のまま値も残る
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("反映中");
    expect(screen.getByRole("group", { name: "2か月の支出" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 })).toBe(heading);
    expect(screen.getByRole("form", { name: "詳細分析の表示条件" })).toBe(form);
    expect(
      screen.getByRole("link", { name: "3か月" }).getAttribute("aria-current"),
    ).toBe("true");

    resolveApply({ status: "ready", data: createThreeMonthData() });
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "3か月の支出" })).toBeTruthy(),
    );
    expect(screen.queryByRole("group", { name: "2か月の支出" })).toBeNull();
    expect(heading.textContent).toBe("2026年7月〜2026年9月");
    expect(region.getAttribute("aria-busy")).toBeNull();
    expect(results()).toBe(region);
    expect(
      within(
        screen.getByRole("table", { name: "月別の正確な数値" }),
      ).getAllByRole("row"),
    ).toHaveLength(4);
    pushState.mockRestore();
  });

  it("集計対象の変更は選択と同時に反映し、グループ・自分ではmemberをURLから除き、指定メンバーでは自分以外を自動選択する (AC-ANA-016-2、4)", async () => {
    vi.mocked(applyAnalyticsDetailsFilterAction).mockResolvedValue({
      status: "ready",
      data: createData({ scope: "self", memberBreakdown: [] }),
    });
    render(<AnalyticsDetails data={createData()} />);

    fireEvent.change(screen.getByLabelText("集計対象"), {
      target: { value: "self" },
    });
    expect(applyAnalyticsDetailsFilterAction).toHaveBeenLastCalledWith(
      GROUP_ID,
      { start: "2026-08", end: "2026-09", scope: "self" },
    );
    expect(currentSearch().get("scope")).toBe("self");
    expect(currentSearch().has("member")).toBe(false);
    await waitFor(() =>
      expect(
        screen.queryByRole("table", { name: "メンバー別の内訳" }),
      ).toBeNull(),
    );

    fireEvent.change(screen.getByLabelText("集計対象"), {
      target: { value: "member" },
    });
    expect(applyAnalyticsDetailsFilterAction).toHaveBeenLastCalledWith(
      GROUP_ID,
      { start: "2026-08", end: "2026-09", scope: "member", member: MEMBER_B },
    );
    expect(currentSearch().get("member")).toBe(MEMBER_B);
    const memberSelect = screen.getByLabelText("メンバー");
    expect((memberSelect as HTMLSelectElement).value).toBe(MEMBER_B);

    fireEvent.change(memberSelect, { target: { value: MEMBER_A } });
    expect(applyAnalyticsDetailsFilterAction).toHaveBeenLastCalledWith(
      GROUP_ID,
      { start: "2026-08", end: "2026-09", scope: "member", member: MEMBER_A },
    );
  });

  it("「期間を指定」はpresetに一致しない期間で開いており、範囲外の入力は取得せず説明を出して結果を残す (AC-ANA-016-3、4)", () => {
    vi.mocked(applyAnalyticsDetailsFilterAction).mockResolvedValue({
      status: "ready",
      data: createThreeMonthData(),
    });
    const pushState = vi.spyOn(window.history, "pushState");
    render(<AnalyticsDetails data={createData()} />);

    const toggle = screen.getByRole("button", { name: "期間を指定" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const start = screen.getByLabelText("開始月") as HTMLInputElement;
    const end = screen.getByLabelText("終了月") as HTMLInputElement;
    expect(start.value).toBe("2026-08");
    expect(end.value).toBe("2026-09");

    fireEvent.change(end, { target: { value: "2026-06" } });
    expect(applyAnalyticsDetailsFilterAction).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("1〜24か月");
    expect(screen.getByRole("group", { name: "2か月の支出" })).toBeTruthy();

    fireEvent.change(end, { target: { value: "2026-10" } });
    expect(applyAnalyticsDetailsFilterAction).toHaveBeenLastCalledWith(
      GROUP_ID,
      { start: "2026-08", end: "2026-10", scope: "group" },
    );
    expect(currentSearch().get("end")).toBe("2026-10");
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("analytics-details-range")?.hidden).toBe(
      true,
    );
    pushState.mockRestore();
  });

  it("presetと一致する期間では「期間を指定」を閉じ、一致するpresetをaria-currentで示す (AC-ANA-016-4)", () => {
    render(<AnalyticsDetails data={createThreeMonthData()} />);

    expect(
      screen
        .getByRole("button", { name: "期間を指定" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen.getByRole("link", { name: "3か月" }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "6か月" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("取得に失敗しても表示中の結果を消さず、再試行できる。サーバーの拒否も結果を残す (AC-ANA-016-3)", async () => {
    vi.mocked(applyAnalyticsDetailsFilterAction)
      .mockResolvedValueOnce({
        status: "error",
        message: "表示条件を反映できませんでした。",
      })
      .mockResolvedValueOnce({ status: "invalid" })
      .mockResolvedValueOnce({
        status: "ready",
        data: createThreeMonthData(),
      });
    render(<AnalyticsDetails data={createData()} />);

    fireEvent.click(screen.getByRole("link", { name: "3か月" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("group", { name: "2か月の支出" })).toBeTruthy();
    expect(results().getAttribute("aria-busy")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "正しくありません",
      ),
    );
    expect(applyAnalyticsDetailsFilterAction).toHaveBeenCalledTimes(2);
    expect(applyAnalyticsDetailsFilterAction).toHaveBeenLastCalledWith(
      GROUP_ID,
      { start: "2026-07", end: "2026-09", scope: "group" },
    );
    expect(screen.getByRole("group", { name: "2か月の支出" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "6か月" }));
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "3か月の支出" })).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ブラウザの戻る／進むではURLの条件に従って再取得する (AC-ANA-016-2)", async () => {
    vi.mocked(applyAnalyticsDetailsFilterAction).mockResolvedValue({
      status: "ready",
      data: createData({ scope: "self", memberBreakdown: [] }),
    });
    render(<AnalyticsDetails data={createData()} />);

    window.history.pushState(
      null,
      "",
      `${detailsPath}?start=2026-08&end=2026-09&scope=self&other=1`,
    );
    fireEvent.popState(window);

    await waitFor(() =>
      expect(applyAnalyticsDetailsFilterAction).toHaveBeenLastCalledWith(
        GROUP_ID,
        { start: "2026-08", end: "2026-09", scope: "self" },
      ),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("集計対象") as HTMLSelectElement).value,
      ).toBe("self"),
    );
  });

  it("連続して条件を変えたときは最後の条件の結果だけを表示する (AC-ANA-016-3)", async () => {
    const resolvers: ((value: {
      status: "ready";
      data: AnalyticsDetailsReady;
    }) => void)[] = [];
    vi.mocked(applyAnalyticsDetailsFilterAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    render(<AnalyticsDetails data={createData()} />);

    fireEvent.click(screen.getByRole("link", { name: "3か月" }));
    fireEvent.change(screen.getByLabelText("集計対象"), {
      target: { value: "self" },
    });
    expect(resolvers).toHaveLength(2);

    resolvers[1]?.({
      status: "ready",
      data: createData({ scope: "self", memberBreakdown: [] }),
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("table", { name: "メンバー別の内訳" }),
      ).toBeNull(),
    );
    resolvers[0]?.({ status: "ready", data: createThreeMonthData() });
    await Promise.resolve();
    expect(screen.queryByRole("group", { name: "3か月の支出" })).toBeNull();
    expect(screen.getByRole("group", { name: "2か月の支出" })).toBeTruthy();
    expect(results().getAttribute("aria-busy")).toBeNull();
  });

  it("月別推移は支出既定の縦棒グラフで、「収入」へ遷移なしに切り替わり、数値表の値は変わらない (AC-ANA-015-1〜3)", () => {
    const { container } = render(<AnalyticsDetails data={createData()} />);

    const section = screen.getByRole("region", { name: "月別推移" });
    const chart = section.querySelector("[data-details-chart='trend']");
    expect(chart?.getAttribute("aria-hidden")).toBe("true");
    expect(chart?.getAttribute("data-trend-series")).toBe("expense");
    const expenseBars = section.querySelectorAll("[data-trend-bar='expense']");
    expect(expenseBars).toHaveLength(2);
    // 支出は8月10,000・9月11,000なので、9月の棒が最大（100%）になる
    expect((expenseBars[1] as HTMLElement).style.height).toBe("100%");
    expect(chart?.textContent).toContain("￥11,000");
    // 旧来の月ごとの横棒一覧は持たない
    expect(section.querySelector("[data-details-bar]")).toBeNull();
    expect(screen.queryByRole("list", { name: "月別推移" })).toBeNull();

    const toggle = within(section).getByRole("group", {
      name: "月別推移の系列",
    });
    fireEvent.click(within(toggle).getByRole("button", { name: "収入" }));
    expect(chart?.getAttribute("data-trend-series")).toBe("income");
    expect(section.querySelectorAll("[data-trend-bar='income']")).toHaveLength(
      2,
    );
    expect(chart?.textContent).toContain("￥20,000");
    expect(section.querySelector("a[href]")).toBeNull();
    expect(section.querySelector("form")).toBeNull();

    const table = screen.getByRole("table", { name: "月別の正確な数値" });
    expect(within(table).getByText("￥10,000")).toBeTruthy();
    expect(within(table).getByText("￥20,000")).toBeTruthy();
    expect(
      container.querySelector("[data-details-chart='savings']"),
    ).toBeTruthy();
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
