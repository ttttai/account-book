"use client";

import { useState } from "react";

import {
  formatAnalyticsJpy,
  formatAnalyticsSignedJpy,
} from "../domain/analytics-jpy";
import { formatAnalyticsMonth } from "../domain/analytics-month";
import {
  type AnalyticsTrendMonth,
  type AnalyticsTrendSeries,
  layoutAnalyticsTrendChart,
} from "../domain/analytics-trend-chart";

import styles from "./analytics.module.css";

type AnalyticsMonthlyTrendChartProps = Readonly<{
  months: readonly AnalyticsTrendMonth[];
}>;

const SERIES_ORDER: readonly AnalyticsTrendSeries[] = [
  "expense",
  "income",
  "savings",
];

const SERIES_LABELS: Readonly<Record<AnalyticsTrendSeries, string>> = {
  expense: "支出",
  income: "収入",
  savings: "貯金額",
};

// 月別推移を横軸＝月・縦軸＝金額の縦棒で描き、支出（既定）・収入・貯金額（累積収支）をローカル状態だけで切り替える。正確な値は数値表が持つ (AC-ANA-015-1〜3, AC-ANA-013-2)
export function AnalyticsMonthlyTrendChart({
  months,
}: AnalyticsMonthlyTrendChartProps) {
  const [series, setSeries] = useState<AnalyticsTrendSeries>("expense");
  const chart = layoutAnalyticsTrendChart(months, series);
  const firstMonth = chart.bars[0]?.month;
  const lastMonth = chart.bars.at(-1)?.month;
  const isSavings = series === "savings";
  // 貯金額は符号付きで上端・下端を示し、支出・収入は最大値と0円を示す
  const formatScale = isSavings ? formatAnalyticsSignedJpy : formatAnalyticsJpy;
  const finalCumulative = months.at(-1)?.cumulativeBalance ?? 0;
  // 棒は枡の6割の太さとし、月数が少なくても24pxを超えない
  const barWidth = `min(${chart.slotWidth * 0.6}%, 24px)`;

  return (
    <div className={styles["analytics-chart"]}>
      <div className={styles["analytics-chart-header"]}>
        <h3>月別推移</h3>
        {/* biome-ignore lint/a11y/useSemanticElements: 系列のボタン群はform制御ではないため、fieldsetではなくARIAのgroupでまとめる */}
        <div
          aria-label="月別推移の系列"
          className={styles["analytics-chart-toggle"]}
          role="group"
        >
          {SERIES_ORDER.map((candidate) => (
            <button
              aria-pressed={series === candidate}
              key={candidate}
              onClick={() => setSeries(candidate)}
              type="button"
            >
              {SERIES_LABELS[candidate]}
            </button>
          ))}
        </div>
      </div>
      {isSavings ? (
        <p className={styles["details-savings-summary"]}>
          <span>期間末の累積収支</span>
          <strong>{formatAnalyticsSignedJpy(finalCumulative)}</strong>
        </p>
      ) : null}
      <div
        aria-hidden="true"
        className={styles["details-trend-chart"]}
        data-details-chart="trend"
        data-trend-labels={chart.labelMode}
        data-trend-series={series}
      >
        <div className={styles["details-trend-scale"]}>
          <span>{formatScale(chart.maxMinor)}</span>
          <span>{formatScale(chart.minMinor)}</span>
        </div>
        <div className={styles["details-trend-plot"]}>
          {chart.bars.map((bar) => (
            <i
              data-chart-bar={bar.direction}
              data-trend-bar={series}
              key={bar.month}
              style={{
                left: `${bar.x}%`,
                top: `${bar.topPercent}%`,
                height: `${bar.heightPercent}%`,
                width: barWidth,
              }}
            />
          ))}
          <i data-chart-baseline="zero" style={{ top: `${chart.zeroY}%` }} />
        </div>
        <div className={styles["details-trend-axis"]}>
          {chart.labelMode !== "edges" ? (
            chart.bars
              .filter((bar) => bar.label !== undefined)
              .map((bar) => (
                <span key={bar.month} style={{ left: `${bar.x}%` }}>
                  {bar.label}
                </span>
              ))
          ) : (
            <>
              <span>{firstMonth ? formatAnalyticsMonth(firstMonth) : ""}</span>
              <span>
                {lastMonth && lastMonth !== firstMonth
                  ? formatAnalyticsMonth(lastMonth)
                  : ""}
              </span>
            </>
          )}
        </div>
      </div>
      <p className={styles["details-muted"]}>
        {isSavings
          ? "収入−支出を開始月から足し上げた値です。期間開始時を0円として計算し、期間前の残高は含みません。各月の値は下の「月別の正確な数値」表の「累積収支」で確認できます。"
          : `選択中の系列は${SERIES_LABELS[series]}です。各月の正確な金額は下の「月別の正確な数値」表で確認できます。`}
      </p>
    </div>
  );
}
