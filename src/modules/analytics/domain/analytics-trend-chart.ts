/** 月別推移で切り替える系列。収支は含めない (ANA-015) */
export type AnalyticsTrendSeries = "expense" | "income";

/** 月別推移が必要とする最小の月別値。DTOの他項目はClient Componentへ渡さない */
export type AnalyticsTrendMonth = Readonly<{
  month: string;
  expenseTotal: number;
  incomeTotal: number;
}>;

export type AnalyticsTrendBar = Readonly<{
  month: string;
  amountMinor: number;
  /** 0〜100の横位置。等間隔に区切った枡の中心で、棒の中心になる */
  x: number;
  /** 期間内最大値に対する高さの比率（0〜100）。全月0円では0 */
  heightPercent: number;
  /** 棒の下に置く`M月`。ラベルを置かない月はundefined */
  label?: string;
}>;

export type AnalyticsTrendChart = Readonly<{
  series: AnalyticsTrendSeries;
  /** 縦軸の上端。選択系列の期間内最大値 */
  maxMinor: number;
  /** 1か月分の枡の幅（0〜100）。棒の太さの上限を決める */
  slotWidth: number;
  /** `each`は各棒の下に月ラベル、`alternate`は終了月から1か月おき、`edges`は開始月・終了月だけ */
  labelMode: AnalyticsTrendLabelMode;
  bars: readonly AnalyticsTrendBar[];
}>;

export type AnalyticsTrendLabelMode = "each" | "alternate" | "edges";

/** 各棒の下に月ラベルを置く上限月数。これを超えると終了月から1か月おきにする (AC-ANA-015-2) */
export const ANALYTICS_TREND_EACH_LABEL_MAX_MONTHS = 6;
/** 1か月おきの月ラベルを置く上限月数。これを超えると開始月・終了月だけにする (AC-ANA-015-2) */
export const ANALYTICS_TREND_ALTERNATE_LABEL_MAX_MONTHS = 12;

// 375pxでも重ならない本数に月ラベルを絞る。1か月おきは終了月を必ず含める
function resolveLabelMode(monthCount: number): AnalyticsTrendLabelMode {
  if (monthCount <= ANALYTICS_TREND_EACH_LABEL_MAX_MONTHS) return "each";
  if (monthCount <= ANALYTICS_TREND_ALTERNATE_LABEL_MAX_MONTHS)
    return "alternate";
  return "edges";
}

function shouldLabel(
  labelMode: AnalyticsTrendLabelMode,
  index: number,
  monthCount: number,
): boolean {
  if (labelMode === "each") return true;
  if (labelMode === "alternate") return (monthCount - 1 - index) % 2 === 0;
  return false;
}

function assertTrendAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("invalid analytics trend amount");
  }
}

function roundPosition(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// 年を省いた`M月`。年は見出しの期間表示で示す
export function formatAnalyticsTrendMonthLabel(month: string): string {
  return `${Number.parseInt(month.slice(5, 7), 10)}月`;
}

// 選択系列の各月金額を、期間内最大値に対する高さと等間隔の中心位置へ写す。全月0円は高さ0で0除算を避ける (AC-ANA-015-2)
export function layoutAnalyticsTrendChart(
  months: readonly AnalyticsTrendMonth[],
  series: AnalyticsTrendSeries,
): AnalyticsTrendChart {
  const amounts = months.map((month) => {
    const amountMinor =
      series === "expense" ? month.expenseTotal : month.incomeTotal;
    assertTrendAmount(amountMinor);
    return amountMinor;
  });
  const maxMinor = Math.max(0, ...amounts);
  const slotWidth = months.length === 0 ? 100 : 100 / months.length;
  const labelMode = resolveLabelMode(months.length);

  return {
    series,
    maxMinor,
    slotWidth: roundPosition(slotWidth),
    labelMode,
    bars: months.map((month, index) => ({
      month: month.month,
      amountMinor: amounts[index] ?? 0,
      x: roundPosition((index + 0.5) * slotWidth),
      heightPercent:
        maxMinor === 0
          ? 0
          : roundPosition(((amounts[index] ?? 0) / maxMinor) * 100),
      ...(shouldLabel(labelMode, index, months.length)
        ? { label: formatAnalyticsTrendMonthLabel(month.month) }
        : {}),
    })),
  };
}
