"use client";

import { useState } from "react";

import {
  type AnalyticsAmountBandBasis,
  type AnalyticsAmountBandTotal,
  type AnalyticsAmountBandRow,
  findTopAnalyticsAmountBand,
  layoutAnalyticsAmountBands,
} from "../domain/analytics-amount-bands";
import { formatAnalyticsJpy } from "../domain/analytics-jpy";

import styles from "./analytics.module.css";

const basisCaptions: Readonly<Record<AnalyticsAmountBandBasis, string>> = {
  count: "棒と割合は件数で比べています。",
  amount: "棒と割合は金額で比べています。",
};

// 選択中の基準で最も大きい帯を1文にする。7行を見比べなくても答えが分かるようにする (AC-ANA-018-3)
function TopBandSummary({
  top,
  basis,
}: Readonly<{ top: AnalyticsAmountBandRow; basis: AnalyticsAmountBandBasis }>) {
  const detail =
    basis === "count"
      ? `（${top.count}件・${top.sharePercent}%）`
      : `（${formatAnalyticsJpy(top.amountMinor)}・${top.sharePercent}%）`;
  return (
    <p className={styles["amount-band-summary"]} data-amount-band-summary="">
      {basis === "count" ? "件数が最も多いのは" : "金額が最も大きいのは"}
      {top.label}
      {/* 括弧内の値は途中で折り返さない */}
      <span className={styles["amount-band-summary-detail"]}>{detail}</span>
    </p>
  );
}

// 金額帯別の支出を7行の一覧と横棒で示し、棒と構成比の基準を件数・金額で切り替える。切替は画面内の状態だけで行う (AC-ANA-018-2〜4)
export function AnalyticsAmountBandChart({
  bands,
}: Readonly<{ bands: readonly AnalyticsAmountBandTotal[] }>) {
  const [basis, setBasis] = useState<AnalyticsAmountBandBasis>("count");

  if (bands.every((band) => band.count === 0)) {
    return <p className={styles["details-muted"]}>支出はありません。</p>;
  }

  const rows = layoutAnalyticsAmountBands(bands, basis);
  const top = findTopAnalyticsAmountBand(rows, basis);

  return (
    <div className={styles["analytics-chart"]} data-amount-band-basis={basis}>
      <div className={styles["analytics-chart-header"]}>
        <p className={styles["amount-band-caption"]}>{basisCaptions[basis]}</p>
        {/* biome-ignore lint/a11y/useSemanticElements: 基準のボタン群はform制御ではないため、fieldsetではなくARIAのgroupでまとめる */}
        <div
          aria-label="金額帯別の支出の基準"
          className={styles["analytics-chart-toggle"]}
          role="group"
        >
          <button
            aria-pressed={basis === "count"}
            onClick={() => setBasis("count")}
            type="button"
          >
            件数
          </button>
          <button
            aria-pressed={basis === "amount"}
            onClick={() => setBasis("amount")}
            type="button"
          >
            金額
          </button>
        </div>
      </div>
      {top ? <TopBandSummary basis={basis} top={top} /> : null}
      {/* 件数・金額・構成比の列を7行でそろえるため、一覧のgridを行と段落がsubgridで共有する (AC-ANA-018-2) */}
      <ul
        aria-label="金額帯別の件数と金額"
        className={styles["amount-band-list"]}
      >
        {rows.map((row) => (
          <li className={styles["amount-band-row"]} key={row.bandId}>
            {/* 1帯1行: 表示名・件数・金額・構成比を同じ段落に並べる (AC-ANA-018-2) */}
            <p className={styles["amount-band-head"]}>
              <span className={styles["amount-band-label"]}>{row.label}</span>
              <span className={styles["amount-band-count"]}>
                {`${row.count}件`}
              </span>
              <span className={styles["amount-band-amount"]}>
                {formatAnalyticsJpy(row.amountMinor)}
              </span>
              <span className={styles["amount-band-share"]}>
                {`${row.sharePercent}%`}
              </span>
            </p>
            {row.barPercent > 0 ? (
              <span
                aria-hidden="true"
                className={styles["amount-band-bar"]}
                data-amount-band-bar=""
                style={{ width: `${row.barPercent}%` }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
