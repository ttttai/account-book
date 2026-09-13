/** 月別推移で切り替える系列。収支は含めず、累積収支を貯金額として持つ (ANA-013, ANA-015) */
export type AnalyticsTrendSeries = "expense" | "income" | "savings";

/** 月別推移が必要とする最小の月別値。DTOの他項目はClient Componentへ渡さない */
export type AnalyticsTrendMonth = Readonly<{
  month: string;
  expenseTotal: number;
  incomeTotal: number;
  /** 開始月から当該月までの累積収支。貯金額系列の値になる (AC-ANA-013-1) */
  cumulativeBalance: number;
}>;

/** 棒が0円の基準線に対して伸びる向き。色分けと角丸に使い、意味は数値表の符号でも伝える */
export type AnalyticsTrendDirection = "positive" | "negative" | "zero";

export type AnalyticsTrendBar = Readonly<{
  month: string;
  amountMinor: number;
  /** 0〜100の横位置。等間隔に区切った枡の中心で、棒の中心になる */
  x: number;
  /** 棒の上端の縦位置（0〜100、0が上端）。基準線と先端のうち上にある方 */
  topPercent: number;
  /** 棒の高さ（0〜100）。全月0円では0 */
  heightPercent: number;
  direction: AnalyticsTrendDirection;
  /** 棒の下に置く`M月`。ラベルを置かない月はundefined */
  label?: string;
}>;

export type AnalyticsTrendChart = Readonly<{
  series: AnalyticsTrendSeries;
  /** 縦軸の上端。支出・収入は期間内最大値、貯金額は0円を含む最大値 */
  maxMinor: number;
  /** 縦軸の下端。支出・収入は0円、貯金額は0円を含む最小値 */
  minMinor: number;
  /** 0円基準線の縦位置（0〜100）。支出・収入では下端の100 */
  zeroY: number;
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

// 支出・収入は負にならず、貯金額（累積収支）だけ符号付きを許す
function assertTrendAmount(
  amountMinor: number,
  series: AnalyticsTrendSeries,
): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("invalid analytics trend amount");
  }
  if (series !== "savings" && amountMinor < 0) {
    throw new Error("invalid analytics trend amount");
  }
}

function selectAmount(
  month: AnalyticsTrendMonth,
  series: AnalyticsTrendSeries,
): number {
  if (series === "expense") return month.expenseTotal;
  if (series === "income") return month.incomeTotal;
  return month.cumulativeBalance;
}

function roundPosition(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function directionOf(amountMinor: number): AnalyticsTrendDirection {
  if (amountMinor > 0) return "positive";
  if (amountMinor < 0) return "negative";
  return "zero";
}

// 年を省いた`M月`。年は見出しの期間表示で示す
export function formatAnalyticsTrendMonthLabel(month: string): string {
  return `${Number.parseInt(month.slice(5, 7), 10)}月`;
}

// 選択系列の各月金額を、0円を含む縦軸上の基準線と先端の位置へ写す。支出・収入は基準線が下端、貯金額は0円の位置になる (AC-ANA-015-2, AC-ANA-013-2)
export function layoutAnalyticsTrendChart(
  months: readonly AnalyticsTrendMonth[],
  series: AnalyticsTrendSeries,
): AnalyticsTrendChart {
  const amounts = months.map((month) => {
    const amountMinor = selectAmount(month, series);
    assertTrendAmount(amountMinor, series);
    return amountMinor;
  });
  const maxMinor = Math.max(0, ...amounts);
  const minMinor = Math.min(0, ...amounts);
  const range = maxMinor - minMinor;
  // 全月0円では範囲が0になるため、支出・収入は下端、貯金額は中央へ基準線を置いて0除算を避ける
  const flatY = series === "savings" ? 50 : 100;
  const toY = (value: number): number =>
    range === 0 ? flatY : roundPosition(((maxMinor - value) / range) * 100);
  const zeroY = toY(0);
  const slotWidth = months.length === 0 ? 100 : 100 / months.length;
  const labelMode = resolveLabelMode(months.length);

  return {
    series,
    maxMinor,
    minMinor,
    zeroY,
    slotWidth: roundPosition(slotWidth),
    labelMode,
    bars: months.map((month, index) => {
      const amountMinor = amounts[index] ?? 0;
      const tipY = toY(amountMinor);
      return {
        month: month.month,
        amountMinor,
        x: roundPosition((index + 0.5) * slotWidth),
        topPercent: roundPosition(Math.min(tipY, zeroY)),
        heightPercent: roundPosition(Math.abs(tipY - zeroY)),
        direction: directionOf(amountMinor),
        ...(shouldLabel(labelMode, index, months.length)
          ? { label: formatAnalyticsTrendMonthLabel(month.month) }
          : {}),
      };
    }),
  };
}
