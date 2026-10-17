import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetTrendScreenData } from "../application/asset-types";
import { AssetTrendScreen } from "./asset-trend-screen";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const CASH = "40000000-0000-4000-8000-000000000001";
const NISA = "40000000-0000-4000-8000-000000000002";
const ME = "50000000-0000-4000-8000-000000000001";
const PARTNER = "50000000-0000-4000-8000-000000000002";

function createData(
  snapshots: AssetTrendScreenData["trend"]["snapshots"],
): AssetTrendScreenData {
  return {
    group: { id: GROUP_ID, name: "わが家" },
    currentMonth: "2026-10",
    trend: {
      categories: [
        {
          id: CASH,
          name: "現金・預金",
          color: "sky",
          sortOrder: 1,
          archived: false,
        },
        {
          id: NISA,
          name: "NISA",
          color: "orange",
          sortOrder: 2,
          archived: false,
        },
      ],
      members: [
        { memberId: ME, displayName: "たいし", removed: false },
        { memberId: PARTNER, displayName: "はなこ", removed: false },
      ],
      snapshots,
    },
  };
}

const data = createData([
  {
    month: "2024-01",
    values: [{ memberId: ME, categoryId: CASH, amountMinor: 500_000 }],
  },
  {
    month: "2026-08",
    values: [
      { memberId: ME, categoryId: CASH, amountMinor: 1_000_000 },
      { memberId: PARTNER, categoryId: NISA, amountMinor: 400_000 },
    ],
  },
  {
    month: "2026-10",
    values: [
      { memberId: ME, categoryId: CASH, amountMinor: 1_100_000 },
      { memberId: ME, categoryId: NISA, amountMinor: 200_000 },
      { memberId: PARTNER, categoryId: NISA, amountMinor: 500_000 },
    ],
  },
]);

afterEach(() => cleanup());

function summaryText(): string {
  return (
    screen.getByRole("region", { name: "選択中の月の合計資産額" })
      .textContent ?? ""
  );
}

describe("AssetTrendScreen", () => {
  it("最新の記録月の合計資産額と前回比を省略しない金額で示す (AC-AST-010-1)", () => {
    render(<AssetTrendScreen data={data} />);
    expect(summaryText()).toContain("2026年10月・グループの合計資産額");
    expect(summaryText()).toContain("￥1,800,000");
    expect(summaryText()).toContain("前回比 ＋￥400,000");
    const breakdown = screen.getByRole("heading", { name: "2026年10月の内訳" })
      .parentElement as HTMLElement;
    expect(breakdown.textContent).toContain("現金・預金￥1,100,00061%");
    expect(breakdown.textContent).toContain("NISA￥700,00039%");
  });

  it("グラフは装飾で、表示期間と積み上げの切替はaria-pressedで示しサーバーへ要求しない (AC-AST-007-1、AC-AST-008-1)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<AssetTrendScreen data={data} />);

    expect(
      document.querySelector("[data-asset-chart]")?.getAttribute("aria-hidden"),
    ).toBe("true");
    const periods = screen.getByRole("group", { name: "表示期間" });
    expect(
      within(periods)
        .getByRole("button", { name: "1年" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    // 1年では2024-01を含まない
    const months = screen.getByRole("heading", { name: "月別の資産額" })
      .parentElement as HTMLElement;
    expect(months.textContent).not.toContain("2024年1月");

    fireEvent.click(within(periods).getByRole("button", { name: "全期間" }));
    expect(months.textContent).toContain("2024年1月");

    fireEvent.click(screen.getByRole("button", { name: "メンバー別" }));
    expect(screen.getByRole("list", { name: "凡例" }).textContent).toBe(
      "たいしはなこ",
    );
    // メンバー別では対象の選択欄を出さない
    expect(screen.queryByLabelText("対象")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("区分別で対象メンバーを選ぶと合計と内訳がそのメンバーの値になる (AC-AST-008-1)", () => {
    render(<AssetTrendScreen data={data} />);
    fireEvent.change(screen.getByLabelText("対象"), {
      target: { value: PARTNER },
    });
    expect(summaryText()).toContain("はなこの合計資産額");
    expect(summaryText()).toContain("￥500,000");
    expect(summaryText()).toContain("前回比 ＋￥100,000");
  });

  it("月別の資産額の行で選択月を変え、修正リンクはその月の記録画面を開く (AC-AST-010-1)", () => {
    render(<AssetTrendScreen data={data} />);
    const august = screen.getByRole("button", { name: /2026年8月/ });
    fireEvent.click(august);
    expect(august.getAttribute("aria-pressed")).toBe("true");
    expect(summaryText()).toContain("2026年8月");
    expect(summaryText()).toContain("￥1,400,000");
    expect(
      screen
        .getByRole("link", { name: "2026年8月の記録を修正" })
        .getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/assets/record?month=2026-08`);
  });

  it("記録のない月が間にあれば注記する (AC-AST-009-1)", () => {
    render(<AssetTrendScreen data={data} />);
    expect(
      screen.getByText(
        "点のある月が記録した月です。間の月は記録がありません。",
      ),
    ).toBeTruthy();
  });

  it("資産記録が1件もなければグラフと表示条件を出さず記録の導線を示す (AC-AST-010-2)", () => {
    render(<AssetTrendScreen data={createData([])} />);
    expect(
      screen.getByText("資産の推移を記録すると、ここにグラフが表示されます。"),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "表示期間" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "資産を記録" }).getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/assets/record`);
  });
});
