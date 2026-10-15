import { CATEGORY_COLORS, type CategoryColor } from "@/modules/categories";

/** 資産区分。アーカイブ済みも過去の記録の表示に使う */
export type AssetCategoryItem = Readonly<{
  id: string;
  name: string;
  color: CategoryColor;
  sortOrder: number;
  archived: boolean;
}>;

/** 表示順（自分、アクティブメンバーの参加順、削除済みメンバーの参加順）に並んだメンバー */
export type AssetMemberItem = Readonly<{
  memberId: string;
  displayName: string;
  removed: boolean;
}>;

export type AssetValueItem = Readonly<{
  memberId: string;
  categoryId: string;
  amountMinor: number;
}>;

export type AssetSnapshotItem = Readonly<{
  /** `YYYY-MM` */
  month: string;
  values: readonly AssetValueItem[];
}>;

/** 推移画面が1回で受け取る全記録。切替はこのデータに対して純関数で行う (AST-008) */
export type AssetTrendData = Readonly<{
  categories: readonly AssetCategoryItem[];
  members: readonly AssetMemberItem[];
  /** 記録月の昇順 */
  snapshots: readonly AssetSnapshotItem[];
}>;

export const ASSET_TREND_RANGES = ["6m", "1y", "3y", "all"] as const;
export type AssetTrendRange = (typeof ASSET_TREND_RANGES)[number];
export type AssetTrendStack = "category" | "member";

export type AssetTrendOptions = Readonly<{
  range: AssetTrendRange;
  stack: AssetTrendStack;
  /** 区分別のときの対象メンバー。nullは全員 */
  memberId: string | null;
  /** nullは範囲内の最新の記録月 */
  selectedMonth: string | null;
}>;

export type AssetTrendSeries = Readonly<{
  key: string;
  label: string;
  color: CategoryColor;
}>;

export type AssetTrendPoint = Readonly<{
  month: string;
  totalMinor: number;
  /** 直前の記録月との差額。直前の記録がなければnull */
  diffMinor: number | null;
}>;

export type AssetTrendBreakdownItem = AssetTrendSeries &
  Readonly<{ amountMinor: number; percent: number }>;

export type AssetTrendArea = Readonly<{
  key: string;
  color: CategoryColor;
  /** SVGのpolygon points */
  points: string;
}>;

export type AssetTrendBar = Readonly<{
  key: string;
  color: CategoryColor;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type AssetTrendChart = Readonly<{
  width: number;
  height: number;
  axisMaxMinor: number;
  ticks: readonly Readonly<{ y: number; label: string }>[];
  areas: readonly AssetTrendArea[];
  /** 記録月が1件だけのときの積み上げ縦棒 */
  bars: readonly AssetTrendBar[];
  /** 記録月の点（合計の上端） */
  markers: readonly Readonly<{ month: string; x: number; y: number }>[];
  startLabel: string;
  endLabel: string;
  /** 範囲内の記録月の間に記録のない月がある */
  hasGaps: boolean;
}>;

export type AssetTrendView = Readonly<{
  /** 凡例と積み上げ順（先頭が最下段） */
  series: readonly AssetTrendSeries[];
  /** 表示期間内の記録月（昇順） */
  points: readonly AssetTrendPoint[];
  chart: AssetTrendChart;
  selected: Readonly<{
    month: string;
    totalMinor: number;
    diffMinor: number | null;
    breakdown: readonly AssetTrendBreakdownItem[];
  }> | null;
}>;

const CHART_WIDTH = 320;
const CHART_HEIGHT = 180;
const SINGLE_BAR_WIDTH = 24;
const TEN_THOUSAND = 10_000;
const RANGE_MONTHS: Readonly<Record<AssetTrendRange, number | null>> = {
  "6m": 6,
  "1y": 12,
  "3y": 36,
  all: null,
};
const REMOVED_SUFFIX = "（退出）";

// `YYYY-MM`を通し番号へ変換する。暦どおりの等間隔の横位置と期間の境界に使う
function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function formatShortMonth(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
}

function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 縦軸の上端を、最大値以上の切りのよい値（1・2・5 × 10の累乗 万円）へ切り上げる。0円だけなら0
export function assetAxisMaxMinor(maxTotalMinor: number): number {
  if (maxTotalMinor <= 0) return 0;
  const tenThousands = Math.ceil(maxTotalMinor / TEN_THOUSAND);
  let magnitude = 1;
  for (;;) {
    for (const step of [1, 2, 5]) {
      if (step * magnitude >= tenThousands) {
        return step * magnitude * TEN_THOUSAND;
      }
    }
    magnitude *= 10;
  }
}

// 縦軸の短縮ラベル（万円単位）。正確な金額は本文で別途示す
export function formatAssetAxisLabel(valueMinor: number): string {
  return `${groupDigits(valueMinor / TEN_THOUSAND)}万円`;
}

// 構成比の整数パーセント。金額の積が安全な整数を超えないようBigIntで四捨五入する (AC-AST-010-1)
export function assetSharePercent(amountMinor: number, totalMinor: number) {
  if (totalMinor <= 0 || amountMinor <= 0) return 0;
  const amount = BigInt(amountMinor);
  const total = BigInt(totalMinor);
  return Number((amount * BigInt(200) + total) / (total * BigInt(2)));
}

// 積み上げる系列を並べる。区分別は資産区分の並び順、メンバー別はメンバーの表示順
function seriesFor(
  data: AssetTrendData,
  stack: AssetTrendStack,
): readonly (AssetTrendSeries & {
  matches: (value: AssetValueItem) => boolean;
})[] {
  if (stack === "category") {
    return [...data.categories]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((category) => ({
        key: category.id,
        label: category.name,
        color: category.color,
        matches: (value: AssetValueItem) => value.categoryId === category.id,
      }));
  }
  return data.members.map((member, index) => ({
    key: member.memberId,
    label: member.removed
      ? `${member.displayName}${REMOVED_SUFFIX}`
      : member.displayName,
    // メンバー別の系列色はカテゴリ色tokenの先頭から順に割り当てる (AC-AST-007-1)
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] ?? "other",
    matches: (value: AssetValueItem) => value.memberId === member.memberId,
  }));
}

function sumOf(values: readonly AssetValueItem[]): number {
  return values.reduce((total, value) => total + value.amountMinor, 0);
}

// 資産推移の系列・座標・縦軸・前回比・構成比を組み立てる。記録のない月は補完しない (AST-007〜AST-010)
// 表示期間・積み上げ・対象・選択月の切替は、受け取った全記録に対してこの関数を呼び直すだけで行う
export function buildAssetTrendSeries(
  data: AssetTrendData,
  options: AssetTrendOptions,
): AssetTrendView {
  const memberFilter =
    options.stack === "category" && options.memberId !== null
      ? options.memberId
      : null;
  const filteredSnapshots = data.snapshots.map((snapshot) => ({
    month: snapshot.month,
    values:
      memberFilter === null
        ? snapshot.values
        : snapshot.values.filter((value) => value.memberId === memberFilter),
  }));

  const latest = filteredSnapshots.at(-1);
  const rangeMonths = RANGE_MONTHS[options.range];
  const endIndex = latest ? monthIndex(latest.month) : 0;
  const rangeStartIndex =
    rangeMonths === null
      ? Number.NEGATIVE_INFINITY
      : endIndex - rangeMonths + 1;

  const totals = filteredSnapshots.map((snapshot) => sumOf(snapshot.values));
  const inRange = filteredSnapshots
    .map((snapshot, index) => ({ snapshot, index }))
    .filter(({ snapshot }) => monthIndex(snapshot.month) >= rangeStartIndex);

  const points: AssetTrendPoint[] = inRange.map(({ snapshot, index }) => {
    const totalMinor = totals[index] ?? 0;
    const previous = index > 0 ? totals[index - 1] : undefined;
    return {
      month: snapshot.month,
      totalMinor,
      diffMinor: previous === undefined ? null : totalMinor - previous,
    };
  });

  const allSeries = seriesFor(data, options.stack);
  const amountsBySeries = allSeries.map((series) =>
    inRange.map(({ snapshot }) =>
      sumOf(snapshot.values.filter((value) => series.matches(value))),
    ),
  );
  // 表示期間内で金額のある系列だけを凡例と積み上げに使う
  const visible = allSeries
    .map((series, index) => ({ series, amounts: amountsBySeries[index] ?? [] }))
    .filter(({ amounts }) => amounts.some((amount) => amount > 0));

  const chart = buildChart(points, visible);
  const series = visible.map(({ series: item }) => ({
    key: item.key,
    label: item.label,
    color: item.color,
  }));

  const selectedPoint =
    points.find((point) => point.month === options.selectedMonth) ??
    points.at(-1);
  const selectedIndex = selectedPoint ? points.indexOf(selectedPoint) : -1;
  const selected = selectedPoint
    ? {
        month: selectedPoint.month,
        totalMinor: selectedPoint.totalMinor,
        diffMinor: selectedPoint.diffMinor,
        breakdown: visible
          .map(({ series: item, amounts }) => ({
            key: item.key,
            label: item.label,
            color: item.color,
            amountMinor: amounts[selectedIndex] ?? 0,
            percent: assetSharePercent(
              amounts[selectedIndex] ?? 0,
              selectedPoint.totalMinor,
            ),
          }))
          .filter((item) => item.amountMinor > 0),
      }
    : null;

  return { series, points, chart, selected };
}

// 積み上げ面（記録月が2件以上）または積み上げ縦棒（1件）の座標を求める
function buildChart(
  points: readonly AssetTrendPoint[],
  visible: readonly Readonly<{
    series: AssetTrendSeries;
    amounts: readonly number[];
  }>[],
): AssetTrendChart {
  const axisMaxMinor = assetAxisMaxMinor(
    Math.max(0, ...points.map((point) => point.totalMinor)),
  );
  const first = points[0];
  const last = points.at(-1);
  const firstIndex = first ? monthIndex(first.month) : 0;
  const span = last ? monthIndex(last.month) - firstIndex : 0;
  const xOf = (month: string) =>
    span === 0
      ? CHART_WIDTH / 2
      : ((monthIndex(month) - firstIndex) / span) * CHART_WIDTH;
  const yOf = (valueMinor: number) =>
    axisMaxMinor === 0
      ? CHART_HEIGHT
      : CHART_HEIGHT - (valueMinor / axisMaxMinor) * CHART_HEIGHT;
  const round = (value: number) => Math.round(value * 10) / 10;

  // 各系列の下端・上端の累積値（記録月ごと）
  const lowers: number[][] = [];
  const uppers: number[][] = [];
  let running = points.map(() => 0);
  for (const { amounts } of visible) {
    lowers.push(running);
    running = running.map((value, index) => value + (amounts[index] ?? 0));
    uppers.push(running);
  }

  const areas: AssetTrendArea[] = [];
  const bars: AssetTrendBar[] = [];
  visible.forEach(({ series }, seriesIndex) => {
    const lower = lowers[seriesIndex] ?? [];
    const upper = uppers[seriesIndex] ?? [];
    if (points.length === 1) {
      const top = yOf(upper[0] ?? 0);
      bars.push({
        key: series.key,
        color: series.color,
        x: round(CHART_WIDTH / 2 - SINGLE_BAR_WIDTH / 2),
        y: round(top),
        width: SINGLE_BAR_WIDTH,
        height: round(yOf(lower[0] ?? 0) - top),
      });
      return;
    }
    const top = points.map(
      (point, index) =>
        `${round(xOf(point.month))},${round(yOf(upper[index] ?? 0))}`,
    );
    const bottom = points
      .map(
        (point, index) =>
          `${round(xOf(point.month))},${round(yOf(lower[index] ?? 0))}`,
      )
      .reverse();
    areas.push({
      key: series.key,
      color: series.color,
      points: [...top, ...bottom].join(" "),
    });
  });

  const ticks =
    axisMaxMinor === 0
      ? []
      : [axisMaxMinor, axisMaxMinor / 2]
          .filter((value) => value % TEN_THOUSAND === 0)
          .map((value) => ({
            y: round(yOf(value)),
            label: formatAssetAxisLabel(value),
          }));

  const hasGaps = points.some(
    (point, index) =>
      index > 0 &&
      monthIndex(point.month) -
        monthIndex(points[index - 1]?.month ?? point.month) >
        1,
  );

  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    axisMaxMinor,
    ticks,
    areas,
    bars,
    markers: points.map((point) => ({
      month: point.month,
      x: round(xOf(point.month)),
      y: round(yOf(point.totalMinor)),
    })),
    startLabel: first ? formatShortMonth(first.month) : "",
    endLabel: last ? formatShortMonth(last.month) : "",
    hasGaps,
  };
}

// グラフ上のタップ位置（0〜1の横比率）に最も近い記録月を返す (AC-AST-008-1)
export function nearestAssetMonth(
  markers: AssetTrendChart["markers"],
  ratio: number,
): string | null {
  let best: { month: string; distance: number } | null = null;
  for (const marker of markers) {
    const distance = Math.abs(marker.x / CHART_WIDTH - ratio);
    if (!best || distance < best.distance) {
      best = { month: marker.month, distance };
    }
  }
  return best?.month ?? null;
}
