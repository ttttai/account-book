"use client";

import { useState } from "react";

import {
  describeAnalyticsPieSlice,
  layoutAnalyticsPie,
} from "../domain/analytics-category-chart";
import { formatAnalyticsJpy } from "../domain/analytics-jpy";

import styles from "./analytics.module.css";

/** 一覧と円グラフの1項目。colorはstyles.cssのカテゴリ色token */
export type AnalyticsCategoryChartItem = Readonly<{
  key: string;
  name: string;
  color: string;
  amountMinor: number;
  sharePercent: number;
}>;

export type AnalyticsCategoryChartMode = "pie" | "bar";

type AnalyticsCategoryChartProps = Readonly<{
  heading: string;
  listLabel: string;
  items: readonly AnalyticsCategoryChartItem[];
}>;

const PIE_GEOMETRY = {
  centerX: 50,
  centerY: 50,
  outerRadius: 48,
  innerRadius: 28,
} as const;

// カテゴリ別支出を円グラフ（既定）と横棒グラフで切り替えて表示する。切替は画面内の状態だけで行い、遷移や再取得を伴わない (AC-ANA-014-1)
export function AnalyticsCategoryChart({
  heading,
  listLabel,
  items,
}: AnalyticsCategoryChartProps) {
  const [mode, setMode] = useState<AnalyticsCategoryChartMode>("pie");
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const slices =
    mode === "pie"
      ? layoutAnalyticsPie(
          items.map((item) => ({
            key: item.key,
            amountMinor: item.amountMinor,
          })),
        )
      : [];

  return (
    <div className={styles["analytics-chart"]} data-analytics-chart={mode}>
      <div className={styles["analytics-chart-header"]}>
        <h3>{heading}</h3>
        {/* biome-ignore lint/a11y/useSemanticElements: 表示形式のボタン群はform制御ではないため、fieldsetではなくARIAのgroupでまとめる */}
        <div
          aria-label="支出カテゴリの表示形式"
          className={styles["analytics-chart-toggle"]}
          role="group"
        >
          <button
            aria-pressed={mode === "pie"}
            onClick={() => setMode("pie")}
            type="button"
          >
            円グラフ
          </button>
          <button
            aria-pressed={mode === "bar"}
            onClick={() => setMode("bar")}
            type="button"
          >
            棒グラフ
          </button>
        </div>
      </div>
      <div className={styles["analytics-chart-body"]}>
        {mode === "pie" ? (
          <svg
            aria-hidden="true"
            className={styles["analytics-pie"]}
            data-analytics-pie=""
            viewBox="0 0 100 100"
          >
            {slices.map((slice) => (
              <path
                d={describeAnalyticsPieSlice(slice, PIE_GEOMETRY)}
                data-analytics-slice=""
                data-category-color={itemByKey.get(slice.key)?.color}
                key={slice.key}
              />
            ))}
          </svg>
        ) : null}
        <ul
          aria-label={listLabel}
          className={styles["analytics-category-list"]}
        >
          {items.map((item) => (
            <li className={styles["analytics-category-row"]} key={item.key}>
              {/* 1カテゴリ1行: 色の印・名称・金額・構成比を同じ段落に並べ、名称だけを省略する (AC-ANA-014-4) */}
              <p className={styles["analytics-category-head"]}>
                <i
                  aria-hidden="true"
                  className={styles["analytics-category-dot"]}
                  data-category-color={item.color}
                  data-category-dot=""
                />
                <span className={styles["analytics-category-name"]}>
                  {item.name}
                </span>
                <span className={styles["analytics-category-amount"]}>
                  {formatAnalyticsJpy(item.amountMinor)}
                </span>
                <span
                  className={styles["analytics-category-share"]}
                  data-analytics-share=""
                >
                  {item.sharePercent}%
                </span>
              </p>
              {mode === "bar" ? (
                <span
                  aria-hidden="true"
                  className={styles["analytics-category-bar"]}
                  data-analytics-bar=""
                  data-category-color={item.color}
                  style={{
                    width: `${Math.min(Math.max(item.sharePercent, 2), 100)}%`,
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
