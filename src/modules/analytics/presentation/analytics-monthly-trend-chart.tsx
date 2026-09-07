"use client";

import { useState } from "react";

import { formatAnalyticsJpy } from "../domain/analytics-jpy";
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

const SERIES_LABELS: Readonly<Record<AnalyticsTrendSeries, string>> = {
  expense: "支出",
  income: "収入",
};

// 月別推移を横軸＝月・縦軸＝金額の縦棒で描き、支出（既定）と収入をローカル状態だけで切り替える。正確な値は数値表が持つ (AC-ANA-015-1〜3)
export function AnalyticsMonthlyTrendChart({
  months,
}: AnalyticsMonthlyTrendChartProps) {
  const [series, setSeries] = useState<AnalyticsTrendSeries>("expense");
  const chart = layoutAnalyticsTrendChart(months, series);
  const firstMonth = chart.bars[0]?.month;
  const lastMonth = chart.bars.at(-1)?.month;
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
          {(["expense", "income"] as const).map((candidate) => (
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
      <div
        aria-hidden="true"
        className={styles["details-trend-chart"]}
        data-details-chart="trend"
        data-trend-labels={chart.labelMode}
        data-trend-series={series}
      >
        <div className={styles["details-trend-scale"]}>
          <span>{formatAnalyticsJpy(chart.maxMinor)}</span>
          <span>{formatAnalyticsJpy(0)}</span>
        </div>
        <div className={styles["details-trend-plot"]}>
          {chart.bars.map((bar) => (
            <i
              data-trend-bar={series}
              key={bar.month}
              style={{
                left: `${bar.x}%`,
                height: `${bar.heightPercent}%`,
                width: barWidth,
              }}
            />
          ))}
          <i data-chart-baseline="zero" />
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
        {`選択中の系列は${SERIES_LABELS[series]}です。各月の正確な金額は下の「月別の正確な数値」表で確認できます。`}
      </p>
    </div>
  );
}
