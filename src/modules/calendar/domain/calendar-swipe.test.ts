import { describe, expect, it } from "vitest";

import { resolveSwipeMonthOffset } from "./calendar-swipe";

describe("resolveSwipeMonthOffset", () => {
  const width = 343;

  it("左スワイプは翌月、右スワイプは前月へ移動する (AC-CAL-015-1)", () => {
    expect(resolveSwipeMonthOffset({ deltaX: -120, deltaY: 4, width })).toBe(1);
    expect(resolveSwipeMonthOffset({ deltaX: 120, deltaY: -4, width })).toBe(
      -1,
    );
  });

  it("水平移動量がカレンダー幅の20%未満なら移動しない (AC-CAL-015-2)", () => {
    // 343 * 0.2 = 68.6 なので 68 は閾値未満、69 は閾値以上
    expect(
      resolveSwipeMonthOffset({ deltaX: -68, deltaY: 0, width }),
    ).toBeUndefined();
    expect(resolveSwipeMonthOffset({ deltaX: -69, deltaY: 0, width })).toBe(1);
  });

  it("幅が狭くても最小48pxの移動を要求する (AC-CAL-015-2)", () => {
    expect(
      resolveSwipeMonthOffset({ deltaX: 47, deltaY: 0, width: 100 }),
    ).toBeUndefined();
    expect(resolveSwipeMonthOffset({ deltaX: 48, deltaY: 0, width: 100 })).toBe(
      -1,
    );
  });

  it("垂直移動量の1.5倍未満の水平移動は縦スクロールとして扱い移動しない (AC-CAL-015-2)", () => {
    expect(
      resolveSwipeMonthOffset({ deltaX: -120, deltaY: 90, width }),
    ).toBeUndefined();
    expect(resolveSwipeMonthOffset({ deltaX: -120, deltaY: 80, width })).toBe(
      1,
    );
    expect(
      resolveSwipeMonthOffset({ deltaX: -120, deltaY: -90, width }),
    ).toBeUndefined();
  });

  it("幅が不正または0以下なら移動しない", () => {
    expect(
      resolveSwipeMonthOffset({ deltaX: -200, deltaY: 0, width: 0 }),
    ).toBeUndefined();
    expect(
      resolveSwipeMonthOffset({ deltaX: -200, deltaY: 0, width: Number.NaN }),
    ).toBeUndefined();
  });
});
