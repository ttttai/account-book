import {
  type AnalyticsExpenseInput,
  type AnalyticsTarget,
  safeAdd,
  sharePercentOf,
  targetExpenseAmount,
} from "./analytics-summary";

/** 金額帯の定義。下限を含み上限を含まない。最後の帯は上限なし (ANA-018) */
export type AnalyticsAmountBand = Readonly<{
  id: string;
  label: string;
  minMinor: number;
  maxMinor?: number;
}>;

/** 小さい金額帯から並べた固定の7帯。期間・対象・データで区切りを変えない (AC-ANA-018-1) */
export const ANALYTICS_AMOUNT_BANDS: readonly AnalyticsAmountBand[] = [
  { id: "under-500", label: "500円未満", minMinor: 1, maxMinor: 500 },
  { id: "500-1000", label: "500〜1,000円", minMinor: 500, maxMinor: 1000 },
  { id: "1000-3000", label: "1,000〜3,000円", minMinor: 1000, maxMinor: 3000 },
  { id: "3000-5000", label: "3,000〜5,000円", minMinor: 3000, maxMinor: 5000 },
  { id: "5000-10000", label: "5,000〜1万円", minMinor: 5000, maxMinor: 10000 },
  { id: "10000-30000", label: "1万〜3万円", minMinor: 10000, maxMinor: 30000 },
  { id: "30000-plus", label: "3万円以上", minMinor: 30000 },
];

/** 1帯の件数と合計金額。詳細分析DTOへ渡す最小の値 */
export type AnalyticsAmountBandTotal = Readonly<{
  bandId: string;
  label: string;
  count: number;
  amountMinor: number;
}>;

/** 横棒と構成比の基準。件数か金額か */
export type AnalyticsAmountBandBasis = "count" | "amount";

/** 画面の1行。構成比と棒の長さは選択中の基準で求める */
export type AnalyticsAmountBandRow = AnalyticsAmountBandTotal &
  Readonly<{ sharePercent: number; barPercent: number }>;

/** 0でない帯の棒が見えなくならない最小の長さ（%） */
const MIN_BAR_PERCENT = 2;

function bandIndexOf(amountMinor: number): number {
  return ANALYTICS_AMOUNT_BANDS.findIndex(
    (band) =>
      amountMinor >= band.minMinor &&
      (band.maxMinor === undefined || amountMinor < band.maxMinor),
  );
}

// 期間内の支出を1件ずつ対象の金額で7帯へ振り分ける。対象の金額は他の集計と同じ規則で、0円は数えない (AC-ANA-018-1)
export function aggregateAnalyticsAmountBands(
  months: readonly string[],
  expenses: readonly AnalyticsExpenseInput[],
  target: AnalyticsTarget,
): readonly AnalyticsAmountBandTotal[] {
  const monthSet = new Set(months);
  const counts = ANALYTICS_AMOUNT_BANDS.map(() => 0);
  const amounts = ANALYTICS_AMOUNT_BANDS.map(() => 0);

  for (const expense of expenses) {
    if (!monthSet.has(expense.date.slice(0, 7))) continue;
    const amountMinor = targetExpenseAmount(expense, target);
    if (amountMinor <= 0) continue;
    const index = bandIndexOf(amountMinor);
    counts[index] = (counts[index] ?? 0) + 1;
    amounts[index] = safeAdd(amounts[index] ?? 0, amountMinor);
  }

  return ANALYTICS_AMOUNT_BANDS.map((band, index) => ({
    bandId: band.id,
    label: band.label,
    count: counts[index] ?? 0,
    amountMinor: amounts[index] ?? 0,
  }));
}

// 選択中の基準で構成比（全体に対する整数%）と棒の長さ（最大帯に対する%）を求める。0の帯は棒を持たない (AC-ANA-018-3)
export function layoutAnalyticsAmountBands(
  bands: readonly AnalyticsAmountBandTotal[],
  basis: AnalyticsAmountBandBasis,
): readonly AnalyticsAmountBandRow[] {
  const basisValue = (band: AnalyticsAmountBandTotal) =>
    basis === "count" ? band.count : band.amountMinor;
  const total = bands.reduce((sum, band) => safeAdd(sum, basisValue(band)), 0);
  const max = bands.reduce(
    (largest, band) => Math.max(largest, basisValue(band)),
    0,
  );

  return bands.map((band) => {
    const value = basisValue(band);
    const barPercent =
      value === 0 || max === 0
        ? 0
        : Math.max(Math.round((value / max) * 1000) / 10, MIN_BAR_PERCENT);
    return {
      ...band,
      sharePercent: sharePercentOf(value, total),
      barPercent,
    };
  });
}
