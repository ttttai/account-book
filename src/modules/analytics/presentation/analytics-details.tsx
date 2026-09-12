import Link from "next/link";

import type {
  AnalyticsDetailsInvalid,
  AnalyticsDetailsReady,
} from "../application/analytics-types";
import {
  formatAnalyticsJpy,
  formatAnalyticsSignedJpy,
} from "../domain/analytics-jpy";
import { formatAnalyticsMonth } from "../domain/analytics-month";
import {
  type AnalyticsCumulativeBalance,
  scaleAnalyticsSavingsChart,
} from "../domain/analytics-savings";
import { AnalyticsCategoryChart } from "./analytics-category-chart";
import { AnalyticsMonthlyTrendChart } from "./analytics-monthly-trend-chart";

import styles from "./analytics.module.css";

function PeriodMetric({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 金額表示はform制御ではないためfieldsetではなくARIA groupで読み上げ単位を示す
    <div
      aria-label={label}
      className={styles["details-period-metric"]}
      role="group"
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// メンバー別表の金額セル。モバイルでは項目名を併記し、読み上げは表の列見出しへ統一する (AC-ANA-009-6)
function DetailsAmountCell({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <td>
      <span aria-hidden="true" className={styles["details-cell-label"]}>
        {label}
      </span>
      <span>{value}</span>
    </td>
  );
}

// 累積収支の棒グラフ。数値は表が主情報のため、グラフ全体を装飾として隠す (AC-ANA-013-2)
function SavingsChart({
  balances,
}: Readonly<{ balances: readonly AnalyticsCumulativeBalance[] }>) {
  const chart = scaleAnalyticsSavingsChart(balances);
  const firstMonth = balances[0]?.month;
  const lastMonth = balances.at(-1)?.month;
  // 棒は枡の6割の太さとし、月数が少なくても24pxを超えない
  const barWidth = `min(${chart.slotWidth * 0.6}%, 24px)`;

  return (
    <div
      aria-hidden="true"
      className={styles["details-savings-chart"]}
      data-details-chart="savings"
    >
      <div className={styles["details-savings-scale"]}>
        <span>{formatAnalyticsSignedJpy(chart.maxMinor)}</span>
        <span>{formatAnalyticsSignedJpy(chart.minMinor)}</span>
      </div>
      <div className={styles["details-savings-plot"]}>
        <i data-chart-baseline="zero" style={{ top: `${chart.zeroY}%` }} />
        {chart.points.map((point) => (
          <i
            data-chart-bar={
              point.y < chart.zeroY
                ? "positive"
                : point.y > chart.zeroY
                  ? "negative"
                  : "zero"
            }
            key={point.month}
            style={{
              left: `${point.x}%`,
              top: `${Math.min(point.y, chart.zeroY)}%`,
              height: `${Math.abs(point.y - chart.zeroY)}%`,
              width: barWidth,
            }}
          />
        ))}
      </div>
      <div className={styles["details-savings-axis"]}>
        <span>{firstMonth ? formatAnalyticsMonth(firstMonth) : ""}</span>
        <span>
          {lastMonth && lastMonth !== firstMonth
            ? formatAnalyticsMonth(lastMonth)
            : ""}
        </span>
      </div>
    </div>
  );
}

// 詳細分析の集計結果（期間指標・推移・貯金額・カテゴリ・メンバー別・数値表）を認可済みDTOから描く
export function AnalyticsDetailsSections({
  data,
}: Readonly<{ data: AnalyticsDetailsReady }>) {
  const cumulativeByMonth = new Map(
    data.cumulativeBalances.map((item) => [item.month, item.cumulativeBalance]),
  );
  const finalCumulative =
    data.cumulativeBalances.at(-1)?.cumulativeBalance ?? 0;
  // 見出しの月数は月別数値表の行数と同じ値を使い、preset・任意指定で規則を変えない (AC-ANA-008-5)
  const monthCountLabel = `${data.months.length}か月`;

  return (
    <>
      <section
        aria-label="期間の主要指標"
        className={styles["details-period-summary"]}
      >
        <PeriodMetric
          label={`${monthCountLabel}の支出`}
          value={formatAnalyticsJpy(data.period.expenseTotal)}
        />
        <PeriodMetric
          label={`${monthCountLabel}の収入`}
          value={formatAnalyticsJpy(data.period.incomeTotal)}
        />
        <PeriodMetric
          label={`${monthCountLabel}の収支`}
          value={formatAnalyticsSignedJpy(data.period.balance)}
        />
        <p>{`月平均 ${formatAnalyticsJpy(data.period.averageExpense)}`}</p>
        <p>
          {data.period.highestExpenseMonth
            ? `最大支出月 ${formatAnalyticsMonth(data.period.highestExpenseMonth)}（${formatAnalyticsJpy(data.months.find((month) => month.month === data.period.highestExpenseMonth)?.expenseTotal ?? 0)}）`
            : "最大支出月 該当なし"}
        </p>
      </section>

      {!data.hasTransactions ? (
        <p className={styles["analytics-empty-message"]}>
          この期間の取引はまだありません。
        </p>
      ) : null}

      <section aria-label="月別推移" className={styles["details-panel"]}>
        <AnalyticsMonthlyTrendChart
          months={data.months.map((month) => ({
            month: month.month,
            expenseTotal: month.expenseTotal,
            incomeTotal: month.incomeTotal,
          }))}
        />
      </section>

      <section aria-label="貯金額の推移" className={styles["details-panel"]}>
        <h3>貯金額の推移</h3>
        <p className={styles["details-savings-summary"]}>
          <span>期間末の累積収支</span>
          <strong>{formatAnalyticsSignedJpy(finalCumulative)}</strong>
        </p>
        <SavingsChart balances={data.cumulativeBalances} />
        <p className={styles["details-muted"]}>
          収入−支出を開始月から足し上げた値です。期間開始時を0円として計算し、期間前の残高は含みません。各月の値は下の数値表の「累積収支」で確認できます。
        </p>
      </section>

      <section className={styles["details-panel"]}>
        {data.period.expenseByCategory.length > 0 ? (
          <AnalyticsCategoryChart
            heading="支出カテゴリ構成"
            items={data.period.expenseByCategory.map((category) => ({
              key: category.categoryId,
              name: category.name,
              color: category.color,
              amountMinor: category.amountMinor,
              sharePercent: category.sharePercent,
            }))}
            listLabel="期間の支出カテゴリ"
          />
        ) : (
          <>
            <h3>支出カテゴリ構成</h3>
            <p className={styles["details-muted"]}>支出はありません。</p>
          </>
        )}
      </section>

      {data.scope === "group" ? (
        <section
          className={`${styles["details-panel"]} ${styles["details-wide"]}`}
        >
          <h3>メンバー別</h3>
          <table
            aria-label="メンバー別の内訳"
            className={`${styles["details-table"]} ${styles["details-table-cards"]}`}
          >
            <thead>
              <tr>
                <th scope="col">メンバー</th>
                <th scope="col">支出額</th>
                <th scope="col">受取額</th>
              </tr>
            </thead>
            <tbody>
              {data.memberBreakdown.map((member) => (
                <tr key={member.membershipId}>
                  <th scope="row">{member.displayName}</th>
                  <DetailsAmountCell
                    label="支出額"
                    value={formatAnalyticsJpy(member.usageTotal)}
                  />
                  <DetailsAmountCell
                    label="受取額"
                    value={formatAnalyticsJpy(member.receivedTotal)}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section
        className={`${styles["details-panel"]} ${styles["details-wide"]}`}
      >
        <h3>月別の正確な数値</h3>
        {/* 列見出しを隠さず、幅を超える場合はこの領域の内側だけを横scrollにする (AC-ANA-009-6) */}
        <div className={styles["details-table-scroll"]}>
          <table
            aria-label="月別の正確な数値"
            className={`${styles["details-table"]} ${styles["details-table-months"]}`}
          >
            <thead>
              <tr>
                <th scope="col">月</th>
                <th scope="col">支出</th>
                <th scope="col">収入</th>
                <th scope="col">収支</th>
                <th scope="col">累積収支</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{formatAnalyticsMonth(month.month)}</th>
                  <td>{formatAnalyticsJpy(month.expenseTotal)}</td>
                  <td>{formatAnalyticsJpy(month.incomeTotal)}</td>
                  <td>{formatAnalyticsSignedJpy(month.balance)}</td>
                  <td>
                    {formatAnalyticsSignedJpy(
                      cumulativeByMonth.get(month.month) ?? 0,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// 不正な詳細分析条件を取引値なしで示し、既定表示へ戻す
export function AnalyticsDetailsValidationError({
  data,
}: Readonly<{ data: AnalyticsDetailsInvalid }>) {
  return (
    <section className="calendar-validation-error" role="alert">
      <p className="eyebrow">表示条件を確認してください</p>
      <h2>詳細分析を表示できません</h2>
      <p>
        期間または集計対象が正しくありません。取引データは読み込んでいません。
      </p>
      <Link
        className="primary-link"
        href={`/groups/${encodeURIComponent(data.groupId)}/analytics/details`}
      >
        既定の6か月表示へ戻る
      </Link>
    </section>
  );
}
