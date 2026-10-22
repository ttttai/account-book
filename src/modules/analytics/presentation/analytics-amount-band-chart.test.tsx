import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AnalyticsAmountBandTotal } from "../domain/analytics-amount-bands";
import { ANALYTICS_AMOUNT_BANDS } from "../domain/analytics-amount-bands";
import { AnalyticsAmountBandChart } from "./analytics-amount-band-chart";

function bandsOf(
  values: readonly (readonly [number, number])[],
): readonly AnalyticsAmountBandTotal[] {
  return ANALYTICS_AMOUNT_BANDS.map((band, index) => ({
    bandId: band.id,
    label: band.label,
    count: values[index]?.[0] ?? 0,
    amountMinor: values[index]?.[1] ?? 0,
  }));
}

const BANDS = bandsOf([
  [4, 1000],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [1, 45000],
]);

function rows(): HTMLElement[] {
  const list = screen.getByRole("list", { name: "金額帯別の件数と金額" });
  return within(list).getAllByRole("listitem");
}

afterEach(() => {
  cleanup();
});

describe("AnalyticsAmountBandChart", () => {
  it("初期表示は件数で、7帯を小さい順に件数・金額・件数の構成比で1行ずつ並べる (AC-ANA-018-2、AC-ANA-018-3)", () => {
    const { container } = render(<AnalyticsAmountBandChart bands={BANDS} />);

    const items = rows();
    expect(items).toHaveLength(7);
    expect(items[0]?.textContent).toBe("500円未満4件￥1,00080%");
    expect(items[1]?.textContent).toBe("500〜1,000円0件￥00%");
    expect(items[6]?.textContent).toBe("3万円以上1件￥45,00020%");
    expect(screen.getByText("棒と割合は件数で比べています。")).toBeTruthy();

    const toggle = screen.getByRole("group", {
      name: "金額帯別の支出の基準",
    });
    expect(
      within(toggle)
        .getByRole("button", { name: "件数" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    // 件数0の帯は棒を描かず、棒は装飾として読み上げない
    const bars = container.querySelectorAll("[data-amount-band-bar]");
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
    }
    expect((bars[0] as HTMLElement).style.width).toBe("100%");
    expect((bars[1] as HTMLElement).style.width).toBe("25%");
  });

  it("金額へ切り替えると棒と構成比の基準だけが変わり、件数・金額のテキストは変わらない (AC-ANA-018-3、AC-ANA-018-4)", () => {
    const { container } = render(<AnalyticsAmountBandChart bands={BANDS} />);

    fireEvent.click(screen.getByRole("button", { name: "金額" }));

    expect(
      screen.getByRole("button", { name: "金額" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "件数" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByText("棒と割合は金額で比べています。")).toBeTruthy();
    const items = rows();
    expect(items[0]?.textContent).toBe("500円未満4件￥1,0002%");
    expect(items[6]?.textContent).toBe("3万円以上1件￥45,00098%");
    const bars = container.querySelectorAll("[data-amount-band-bar]");
    expect((bars[1] as HTMLElement).style.width).toBe("100%");
    // 切替はリンクやformを使わない
    expect(container.querySelector("a, form")).toBeNull();
  });

  it("支出が0件なら一覧と切替を表示しない (AC-ANA-018-2)", () => {
    render(<AnalyticsAmountBandChart bands={bandsOf([])} />);

    expect(screen.getByText("支出はありません。")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });
});
