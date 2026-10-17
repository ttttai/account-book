import { describe, expect, it } from "vitest";

import {
  type AssetTrendData,
  type AssetTrendOptions,
  assetAxisMaxMinor,
  assetAxisStepMinor,
  assetSharePercent,
  buildAssetTrendSeries,
  formatAssetAxisLabel,
  nearestAssetMonth,
} from "./asset-trend";

const CASH = "40000000-0000-4000-8000-000000000001";
const NISA = "40000000-0000-4000-8000-000000000002";
const IDECO = "40000000-0000-4000-8000-000000000003";
const ME = "50000000-0000-4000-8000-000000000001";
const PARTNER = "50000000-0000-4000-8000-000000000002";
const FORMER = "50000000-0000-4000-8000-000000000003";

const categories: AssetTrendData["categories"] = [
  { id: NISA, name: "NISA", color: "orange", sortOrder: 2, archived: false },
  { id: CASH, name: "現金・預金", color: "sky", sortOrder: 1, archived: false },
  { id: IDECO, name: "iDeCo", color: "mint", sortOrder: 3, archived: true },
];
const members: AssetTrendData["members"] = [
  { memberId: ME, displayName: "自分", removed: false },
  { memberId: PARTNER, displayName: "相手", removed: false },
  { memberId: FORMER, displayName: "元メンバー", removed: true },
];

const data: AssetTrendData = {
  categories,
  members,
  snapshots: [
    {
      month: "2025-04",
      values: [
        { memberId: ME, categoryId: CASH, amountMinor: 1_000_000 },
        { memberId: FORMER, categoryId: IDECO, amountMinor: 500_000 },
      ],
    },
    {
      month: "2026-03",
      values: [
        { memberId: ME, categoryId: CASH, amountMinor: 1_200_000 },
        { memberId: ME, categoryId: NISA, amountMinor: 300_000 },
        { memberId: PARTNER, categoryId: CASH, amountMinor: 500_000 },
      ],
    },
    {
      month: "2026-05",
      values: [
        { memberId: ME, categoryId: CASH, amountMinor: 1_100_000 },
        { memberId: ME, categoryId: NISA, amountMinor: 400_000 },
        { memberId: PARTNER, categoryId: CASH, amountMinor: 600_000 },
      ],
    },
  ],
};

const defaults: AssetTrendOptions = {
  range: "1y",
  stack: "category",
  memberId: null,
  selectedMonth: null,
};

describe("buildAssetTrendSeries", () => {
  it("区分別は資産区分の並び順に下から積み上げ、金額のある系列だけを凡例にする (AC-AST-007-1)", () => {
    const view = buildAssetTrendSeries(data, defaults);
    expect(view.series.map((series) => series.label)).toEqual([
      "現金・預金",
      "NISA",
    ]);
    expect(view.chart.areas.map((area) => area.key)).toEqual([CASH, NISA]);
  });

  it("メンバー別は表示順に積み上げ、削除済みメンバーに（退出）を付ける (AC-AST-007-1)", () => {
    const view = buildAssetTrendSeries(data, {
      ...defaults,
      range: "all",
      stack: "member",
    });
    expect(view.series.map((series) => series.label)).toEqual([
      "自分",
      "相手",
      "元メンバー（退出）",
    ]);
    expect(view.series.map((series) => series.color)).toEqual([
      "food",
      "daily",
      "home",
    ]);
  });

  it("表示期間は最新の記録月を含む直近の月数に限る (AC-AST-008-1)", () => {
    expect(
      buildAssetTrendSeries(data, defaults).points.map((point) => point.month),
    ).toEqual(["2026-03", "2026-05"]);
    expect(
      buildAssetTrendSeries(data, { ...defaults, range: "all" }).points.map(
        (point) => point.month,
      ),
    ).toEqual(["2025-04", "2026-03", "2026-05"]);
    // 2026-05を終了月とする1年は2025-06〜2026-05。境界の2025-06は含み、2025-05は含まない
    const boundary: AssetTrendData = {
      ...data,
      snapshots: [
        { month: "2025-05", values: [] },
        { month: "2025-06", values: [] },
        { month: "2026-05", values: [] },
      ],
    };
    expect(
      buildAssetTrendSeries(boundary, defaults).points.map(
        (point) => point.month,
      ),
    ).toEqual(["2025-06", "2026-05"]);
  });

  it("前回比は表示期間外も含めた直前の記録月との差額で、最初の記録はnull", () => {
    const view = buildAssetTrendSeries(data, defaults);
    expect(view.points).toEqual([
      { month: "2026-03", totalMinor: 2_000_000, diffMinor: 500_000 },
      { month: "2026-05", totalMinor: 2_100_000, diffMinor: 100_000 },
    ]);
    const all = buildAssetTrendSeries(data, { ...defaults, range: "all" });
    expect(all.points[0]?.diffMinor).toBeNull();
  });

  it("記録のない月は点を置かず、間に空きがあるとき注記用のフラグを立てる (AC-AST-009-1)", () => {
    const view = buildAssetTrendSeries(data, defaults);
    expect(view.chart.markers.map((marker) => marker.month)).toEqual([
      "2026-03",
      "2026-05",
    ]);
    expect(view.chart.hasGaps).toBe(true);
    // 2026-03と2026-05の間の2026-04は横位置の中央だが点も値も持たない
    expect(view.chart.markers.map((marker) => marker.x)).toEqual([0, 320]);
  });

  it("記録月が1件だけのときは積み上げた縦棒1本で描く (AC-AST-009-1)", () => {
    const single: AssetTrendData = {
      ...data,
      snapshots: [data.snapshots[2] as AssetTrendData["snapshots"][number]],
    };
    const view = buildAssetTrendSeries(single, defaults);
    expect(view.chart.areas).toEqual([]);
    expect(view.chart.bars).toHaveLength(2);
    expect(view.chart.bars.every((bar) => bar.width === 24)).toBe(true);
    expect(view.chart.hasGaps).toBe(false);
  });

  it("全記録が0円でも0除算を起こさず基準線だけになる (AC-AST-009-1)", () => {
    const zero: AssetTrendData = {
      ...data,
      snapshots: [
        { month: "2026-04", values: [] },
        { month: "2026-05", values: [] },
      ],
    };
    const view = buildAssetTrendSeries(zero, defaults);
    expect(view.chart.axisMaxMinor).toBe(0);
    expect(view.chart.ticks).toEqual([]);
    expect(view.chart.areas).toEqual([]);
    expect(view.selected).toEqual({
      month: "2026-05",
      totalMinor: 0,
      diffMinor: 0,
      breakdown: [],
    });
  });

  it("区分別で対象メンバーを選ぶと合計・前回比・内訳がそのメンバーの値になる (AC-AST-008-1)", () => {
    const view = buildAssetTrendSeries(data, { ...defaults, memberId: ME });
    expect(view.points).toEqual([
      { month: "2026-03", totalMinor: 1_500_000, diffMinor: 500_000 },
      { month: "2026-05", totalMinor: 1_500_000, diffMinor: 0 },
    ]);
    // メンバー別の積み上げでは対象メンバーを使わない
    const byMember = buildAssetTrendSeries(data, {
      ...defaults,
      stack: "member",
      memberId: ME,
    });
    expect(byMember.points.at(-1)?.totalMinor).toBe(2_100_000);
  });

  it("選択月の内訳は系列ごとの金額と整数パーセントで、範囲外の選択は最新の記録月へ戻す (AC-AST-010-1)", () => {
    const view = buildAssetTrendSeries(data, {
      ...defaults,
      selectedMonth: "2026-03",
    });
    expect(view.selected).toEqual({
      month: "2026-03",
      totalMinor: 2_000_000,
      diffMinor: 500_000,
      breakdown: [
        {
          key: CASH,
          label: "現金・預金",
          color: "sky",
          amountMinor: 1_700_000,
          percent: 85,
        },
        {
          key: NISA,
          label: "NISA",
          color: "orange",
          amountMinor: 300_000,
          percent: 15,
        },
      ],
    });
    const outOfRange = buildAssetTrendSeries(data, {
      ...defaults,
      selectedMonth: "2025-04",
    });
    expect(outOfRange.selected?.month).toBe("2026-05");
  });

  it("資産記録がなければ点も選択月も持たない (AC-AST-010-2)", () => {
    const view = buildAssetTrendSeries({ ...data, snapshots: [] }, defaults);
    expect(view.points).toEqual([]);
    expect(view.selected).toBeNull();
    expect(view.chart.markers).toEqual([]);
  });

  it("積み上げの上端は各月の合計と一致する", () => {
    const view = buildAssetTrendSeries(data, defaults);
    // 縦軸上端は210万円→250万円、2026-05の合計210万円は高さ180の84%
    expect(view.chart.axisMaxMinor).toBe(2_500_000);
    expect(view.chart.markers.at(-1)?.y).toBe(28.8);
    const topArea = view.chart.areas.at(-1);
    expect(topArea?.points.split(" ")[1]).toBe("320,28.8");
  });
});

describe("縦軸と表示値", () => {
  it("縦軸は目盛り線6本以下の1・2・5 × 10の累乗 万円間隔で、上端を間隔の倍数へ切り上げる", () => {
    expect(assetAxisStepMinor(0)).toBe(0);
    expect(assetAxisMaxMinor(0)).toBe(0);
    expect(assetAxisMaxMinor(1)).toBe(10_000);
    expect(assetAxisMaxMinor(15_000)).toBe(20_000);
    expect(assetAxisMaxMinor(2_100_000)).toBe(2_500_000);
    expect(assetAxisMaxMinor(50_000_000)).toBe(50_000_000);
    // 5,659万円は1,000万円間隔で6,000万円まで
    expect(assetAxisStepMinor(56_590_000)).toBe(10_000_000);
    expect(assetAxisMaxMinor(56_590_000)).toBe(60_000_000);
  });

  it("目盛り線は上端から間隔ごとに引き、6本以下にする", () => {
    const { chart } = buildAssetTrendSeries(data, defaults);
    expect(chart.ticks.map((tick) => tick.label)).toEqual([
      "250万円",
      "200万円",
      "150万円",
      "100万円",
      "50万円",
    ]);
  });

  it("縦軸ラベルは万円単位で3桁区切りにする", () => {
    expect(formatAssetAxisLabel(60_000_000)).toBe("6,000万円");
    expect(formatAssetAxisLabel(50_000)).toBe("5万円");
  });

  it("構成比は整数パーセントへ四捨五入し、安全な整数を超える積でも誤差を出さない", () => {
    expect(assetSharePercent(1, 8)).toBe(13);
    expect(assetSharePercent(0, 100)).toBe(0);
    expect(assetSharePercent(100, 0)).toBe(0);
    expect(
      assetSharePercent(9_007_199_254_740_991, 9_007_199_254_740_991),
    ).toBe(100);
  });

  it("タップ位置に最も近い記録月を選ぶ", () => {
    const { chart } = buildAssetTrendSeries(data, defaults);
    expect(nearestAssetMonth(chart.markers, 0.2)).toBe("2026-03");
    expect(nearestAssetMonth(chart.markers, 0.9)).toBe("2026-05");
    expect(nearestAssetMonth([], 0.5)).toBeNull();
  });
});
