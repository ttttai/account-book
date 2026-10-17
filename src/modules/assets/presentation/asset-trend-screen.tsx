"use client";

import Link from "next/link";
import { type MouseEvent, useId, useMemo, useState } from "react";

import {
  formatAnalyticsJpy,
  formatAnalyticsMonth,
  formatAnalyticsSignedJpy,
} from "@/modules/analytics";

import type { AssetTrendScreenData } from "../application/asset-types";
import {
  type AssetTrendRange,
  type AssetTrendStack,
  type AssetTrendView,
  buildAssetTrendSeries,
  nearestAssetMonth,
} from "../domain/asset-trend";
import { createAssetRecordUrl } from "../domain/asset-url";

import styles from "./assets.module.css";

const RANGE_LABELS: Readonly<Record<AssetTrendRange, string>> = {
  "6m": "6か月",
  "1y": "1年",
  "3y": "3年",
  all: "全期間",
};
const RANGES: readonly AssetTrendRange[] = ["6m", "1y", "3y", "all"];
const STACK_LABELS: Readonly<Record<AssetTrendStack, string>> = {
  category: "区分別",
  member: "メンバー別",
};
const STACKS: readonly AssetTrendStack[] = ["category", "member"];

function DiffText({ diffMinor }: Readonly<{ diffMinor: number | null }>) {
  if (diffMinor === null) return null;
  return <>{`前回比 ${formatAnalyticsSignedJpy(diffMinor)}`}</>;
}

type ChartProps = Readonly<{
  view: AssetTrendView;
  onSelect: (month: string) => void;
}>;

// 積み上げ面グラフ。aria-hiddenの装飾で、同じ値は内訳と月別の資産額で示す (AC-AST-009-1、AC-AST-010-1)
// タップは選択月の変更だけを行い、座標は純関数の結果を描くだけにする
function AssetTrendChart({ view, onSelect }: ChartProps) {
  const { chart, selected } = view;
  const selectedMarker = chart.markers.find(
    (marker) => marker.month === selected?.month,
  );

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const month = nearestAssetMonth(
      chart.markers,
      (event.clientX - rect.left) / rect.width,
    );
    if (month) onSelect(month);
  }

  return (
    <div className={styles["asset-chart"]}>
      {/* グラフのタップは補助操作で、同じ選択は月別の資産額のボタンで行える */}
      <div
        aria-hidden="true"
        className={styles["asset-chart-plot"]}
        data-asset-chart=""
        onClick={handleClick}
      >
        <svg
          aria-hidden="true"
          className={styles["asset-chart-svg"]}
          focusable="false"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
        >
          {chart.ticks.map((tick) => (
            <line
              className={styles["asset-chart-grid"]}
              key={tick.label}
              x1={0}
              x2={chart.width}
              y1={tick.y}
              y2={tick.y}
            />
          ))}
          {chart.areas.map((area) => (
            <polygon
              className={styles["asset-chart-area"]}
              data-category-color={area.color}
              key={area.key}
              points={area.points}
            />
          ))}
          {chart.bars.map((bar) => (
            <rect
              className={styles["asset-chart-area"]}
              data-category-color={bar.color}
              height={bar.height}
              key={bar.key}
              width={bar.width}
              x={bar.x}
              y={bar.y}
            />
          ))}
          <line
            className={styles["asset-chart-baseline"]}
            x1={0}
            x2={chart.width}
            y1={chart.height}
            y2={chart.height}
          />
          {selectedMarker ? (
            <line
              className={styles["asset-chart-cursor"]}
              x1={selectedMarker.x}
              x2={selectedMarker.x}
              y1={0}
              y2={chart.height}
            />
          ) : null}
          {chart.markers.map((marker) => (
            <circle
              className={styles["asset-chart-marker"]}
              cx={marker.x}
              cy={marker.y}
              data-selected={marker.month === selected?.month ? "" : undefined}
              key={marker.month}
              r={marker.month === selected?.month ? 4 : 2.5}
            />
          ))}
        </svg>
        {chart.ticks.map((tick) => (
          <span
            className={styles["asset-chart-tick"]}
            key={tick.label}
            style={{ top: `${(tick.y / chart.height) * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <p aria-hidden="true" className={styles["asset-chart-axis"]}>
        <span>{chart.startLabel}</span>
        <span>{chart.endLabel}</span>
      </p>
      {chart.hasGaps ? (
        <p className={styles["asset-chart-note"]}>
          点のある月が記録した月です。間の月は記録がありません。
        </p>
      ) : null}
    </div>
  );
}

type AssetTrendScreenProps = Readonly<{ data: AssetTrendScreenData }>;

// 資産推移画面。表示期間・積み上げ・対象・選択月はローカル状態だけで切り替え、再取得しない (AST-007、AST-008)
export function AssetTrendScreen({ data }: AssetTrendScreenProps) {
  const memberSelectId = useId();
  const [range, setRange] = useState<AssetTrendRange>("1y");
  const [stack, setStack] = useState<AssetTrendStack>("category");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const view = useMemo(
    () =>
      buildAssetTrendSeries(data.trend, {
        range,
        stack,
        memberId,
        selectedMonth,
      }),
    [data.trend, range, stack, memberId, selectedMonth],
  );
  const recordUrl = createAssetRecordUrl(data.group.id);
  const analyticsUrl = `/groups/${encodeURIComponent(data.group.id)}/analytics`;

  if (data.trend.snapshots.length === 0) {
    return (
      <section className={styles["asset-empty"]}>
        <p>資産の推移を記録すると、ここにグラフが表示されます。</p>
        <p className={styles["asset-muted"]}>
          各メンバーの現金・預金やNISAなどの月末の金額を、月ごとに記録します。
        </p>
        <Link className="primary-link" href={recordUrl}>
          資産を記録
        </Link>
        <Link className={styles["asset-back-link"]} href={analyticsUrl}>
          概要分析へ戻る
        </Link>
      </section>
    );
  }

  const selected = view.selected;
  const subject =
    stack === "category" && memberId
      ? (data.trend.members.find((member) => member.memberId === memberId)
          ?.displayName ?? "メンバー")
      : "グループ";

  return (
    <div className={styles["asset-layout"]}>
      <div className={styles["asset-main"]}>
        <section
          aria-label="選択中の月の合計資産額"
          className={styles["asset-summary"]}
        >
          <p className={styles["asset-summary-label"]}>
            {selected
              ? `${formatAnalyticsMonth(selected.month)}・${subject}の合計資産額`
              : `${subject}の合計資産額`}
          </p>
          <p className={styles["asset-summary-amount"]}>
            {selected ? formatAnalyticsJpy(selected.totalMinor) : "—"}
          </p>
          <p className={styles["asset-summary-diff"]}>
            <DiffText diffMinor={selected?.diffMinor ?? null} />
          </p>
        </section>

        <div className={styles["asset-controls"]}>
          {/* biome-ignore lint/a11y/useSemanticElements: 切替ボタン群はform制御ではないため、fieldsetではなくARIAのgroupでまとめる */}
          <div
            aria-label="表示期間"
            className={styles["asset-segment"]}
            role="group"
          >
            {RANGES.map((option) => (
              <button
                aria-pressed={range === option}
                key={option}
                onClick={() => setRange(option)}
                type="button"
              >
                {RANGE_LABELS[option]}
              </button>
            ))}
          </div>
          <div className={styles["asset-control-row"]}>
            {/* biome-ignore lint/a11y/useSemanticElements: 切替ボタン群はform制御ではないため、fieldsetではなくARIAのgroupでまとめる */}
            <div
              aria-label="積み上げ"
              className={styles["asset-segment"]}
              role="group"
            >
              {STACKS.map((option) => (
                <button
                  aria-pressed={stack === option}
                  key={option}
                  onClick={() => setStack(option)}
                  type="button"
                >
                  {STACK_LABELS[option]}
                </button>
              ))}
            </div>
            {stack === "category" ? (
              <label
                className={styles["asset-member-select"]}
                htmlFor={memberSelectId}
              >
                <span>対象</span>
                <select
                  id={memberSelectId}
                  onChange={(event) =>
                    setMemberId(
                      event.target.value === "" ? null : event.target.value,
                    )
                  }
                  value={memberId ?? ""}
                >
                  <option value="">全員</option>
                  {data.trend.members.map((member) => (
                    <option key={member.memberId} value={member.memberId}>
                      {member.removed
                        ? `${member.displayName}（退出）`
                        : member.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        {view.points.length === 0 ? (
          <p className={styles["asset-muted"]}>
            この条件で表示できる記録はありません。
          </p>
        ) : (
          <AssetTrendChart onSelect={setSelectedMonth} view={view} />
        )}

        {view.series.length > 0 ? (
          <ul aria-label="凡例" className={styles["asset-legend"]}>
            {view.series.map((series) => (
              <li key={series.key}>
                <span
                  aria-hidden="true"
                  className={styles["asset-dot"]}
                  data-category-color={series.color}
                />
                {series.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={styles["asset-side"]}>
        {selected ? (
          <section className={styles["asset-breakdown"]}>
            <h2>{`${formatAnalyticsMonth(selected.month)}の内訳`}</h2>
            {selected.breakdown.length === 0 ? (
              <p className={styles["asset-muted"]}>この月の資産額は0円です。</p>
            ) : (
              <ul>
                {selected.breakdown.map((item) => (
                  <li key={item.key}>
                    <span
                      aria-hidden="true"
                      className={styles["asset-dot"]}
                      data-category-color={item.color}
                    />
                    <span className={styles["asset-breakdown-name"]}>
                      {item.label}
                    </span>
                    <span className={styles["asset-breakdown-amount"]}>
                      {formatAnalyticsJpy(item.amountMinor)}
                    </span>
                    <span className={styles["asset-breakdown-percent"]}>
                      {`${item.percent}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className={styles["asset-months"]}>
          <h2>月別の資産額</h2>
          <ol>
            {[...view.points].reverse().map((point) => (
              <li key={point.month}>
                <button
                  aria-pressed={point.month === selected?.month}
                  className={styles["asset-month-select"]}
                  onClick={() => setSelectedMonth(point.month)}
                  type="button"
                >
                  <span className={styles["asset-month-name"]}>
                    {formatAnalyticsMonth(point.month)}
                  </span>
                  <span className={styles["asset-month-total"]}>
                    {formatAnalyticsJpy(point.totalMinor)}
                  </span>
                  <span className={styles["asset-month-diff"]}>
                    <DiffText diffMinor={point.diffMinor} />
                  </span>
                </button>
                <Link
                  aria-label={`${formatAnalyticsMonth(point.month)}の記録を修正`}
                  className={styles["asset-month-edit"]}
                  href={createAssetRecordUrl(data.group.id, point.month)}
                >
                  修正
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <Link className={styles["asset-back-link"]} href={analyticsUrl}>
          概要分析へ戻る
        </Link>
      </div>
    </div>
  );
}
