import { describe, expect, it } from "vitest";

import {
  describeAnalyticsPieSlice,
  layoutAnalyticsPie,
} from "./analytics-category-chart";

const GEOMETRY = {
  centerX: 50,
  centerY: 50,
  outerRadius: 50,
  innerRadius: 30,
} as const;

describe("layoutAnalyticsPie", () => {
  it("金額の合計比から扇形の開始・終了位置を求め、渡した順に時計回りへ並べる (AC-ANA-014-2)", () => {
    const slices = layoutAnalyticsPie([
      { key: "food", amountMinor: 6000 },
      { key: "home", amountMinor: 3000 },
      { key: "others", amountMinor: 1000 },
    ]);

    expect(slices.map((slice) => slice.key)).toEqual([
      "food",
      "home",
      "others",
    ]);
    expect(slices[0]?.startTurn).toBe(0);
    expect(slices[0]?.endTurn).toBeCloseTo(0.6, 10);
    expect(slices[1]?.startTurn).toBeCloseTo(0.6, 10);
    expect(slices[1]?.endTurn).toBeCloseTo(0.9, 10);
    expect(slices[2]?.startTurn).toBeCloseTo(0.9, 10);
    // 最後の扇形は必ず一周で終わり、丸めで隙間や重なりを作らない
    expect(slices[2]?.endTurn).toBe(1);
  });

  it("端数のある金額でも扇形は途切れず連続し、合計が一周と一致する (AC-ANA-014-2)", () => {
    const slices = layoutAnalyticsPie([
      { key: "a", amountMinor: 1 },
      { key: "b", amountMinor: 1 },
      { key: "c", amountMinor: 1 },
    ]);

    for (let index = 1; index < slices.length; index += 1) {
      expect(slices[index]?.startTurn).toBe(slices[index - 1]?.endTurn);
    }
    expect(slices.at(-1)?.endTurn).toBe(1);
    const total = slices.reduce(
      (sum, slice) => sum + (slice.endTurn - slice.startTurn),
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });

  it("1件だけなら全周、0円の項目は扇形を持たず、合計0円なら空になる (AC-ANA-014-2)", () => {
    expect(layoutAnalyticsPie([{ key: "only", amountMinor: 500 }])).toEqual([
      { key: "only", startTurn: 0, endTurn: 1 },
    ]);
    expect(
      layoutAnalyticsPie([
        { key: "zero", amountMinor: 0 },
        { key: "paid", amountMinor: 200 },
      ]),
    ).toEqual([{ key: "paid", startTurn: 0, endTurn: 1 }]);
    expect(layoutAnalyticsPie([])).toEqual([]);
    expect(layoutAnalyticsPie([{ key: "zero", amountMinor: 0 }])).toEqual([]);
  });

  it("負の金額や整数でない金額は拒否する", () => {
    expect(() => layoutAnalyticsPie([{ key: "x", amountMinor: -1 }])).toThrow();
    expect(() =>
      layoutAnalyticsPie([{ key: "x", amountMinor: 10.5 }]),
    ).toThrow();
  });
});

describe("describeAnalyticsPieSlice", () => {
  it("12時方向から時計回りに描くドーナツ状のSVG pathを返す (AC-ANA-014-2)", () => {
    const quarter = describeAnalyticsPieSlice(
      { key: "q", startTurn: 0, endTurn: 0.25 },
      GEOMETRY,
    );

    // 外周を12時→3時へ、内周を3時→12時へ戻って閉じる。半周未満なのでlarge-arcは0
    expect(quarter).toBe(
      "M 50 0 A 50 50 0 0 1 100 50 L 80 50 A 30 30 0 0 0 50 20 Z",
    );
  });

  it("半周を超える扇形はlarge-arcフラグを立てる (AC-ANA-014-2)", () => {
    const wide = describeAnalyticsPieSlice(
      { key: "w", startTurn: 0, endTurn: 0.75 },
      GEOMETRY,
    );

    expect(wide.startsWith("M 50 0 A 50 50 0 1 1 0 50")).toBe(true);
    expect(wide.endsWith("Z")).toBe(true);
    expect(wide).not.toMatch(/NaN/);
  });

  it("全周の扇形は2つの半円で閉じた輪として描く (AC-ANA-014-2)", () => {
    const full = describeAnalyticsPieSlice(
      { key: "f", startTurn: 0, endTurn: 1 },
      GEOMETRY,
    );

    expect(full).toBe(
      "M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z M 50 20 A 30 30 0 1 0 50 80 A 30 30 0 1 0 50 20 Z",
    );
  });
});
