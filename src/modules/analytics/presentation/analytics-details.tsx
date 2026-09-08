import Form from "next/form";
import Link from "next/link";

import type {
  AnalyticsDetailsInvalid,
  AnalyticsDetailsReady,
} from "../application/analytics-types";
import { analyticsPresetStart } from "../domain/analytics-details-input";
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

function detailsUrl(data: AnalyticsDetailsReady, startMonth: string): string {
  const params = new URLSearchParams({
    start: startMonth,
    end: data.endMonth,
    scope: data.scope,
  });
  if (data.scope === "member" && data.selectedMemberId) {
    params.set("member", data.selectedMemberId);
  }
  return `/groups/${encodeURIComponent(data.group.id)}/analytics/details?${params.toString()}`;
}

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

// モバイルでは項目名を併記し、読み上げは表の列見出しへ統一する。
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

// 期間・対象filterと、推移・カテゴリ・メンバー別統計を数値中心で表示する
export function AnalyticsDetails({
  data,
}: Readonly<{ data: AnalyticsDetailsReady }>) {
  const route = `/groups/${encodeURIComponent(data.group.id)}/analytics/details`;
  const cumulativeByMonth = new Map(
    data.cumulativeBalances.map((item) => [item.month, item.cumulativeBalance]),
  );
  const finalCumulative =
    data.cumulativeBalances.at(-1)?.cumulativeBalance ?? 0;

  return (
    <div className={styles["details-layout"]}>
      <header className={styles["details-heading"]}>
        <div>
          <p className="eyebrow">詳細分析</p>
          <h2>{`${formatAnalyticsMonth(data.startMonth)}〜${formatAnalyticsMonth(data.endMonth)}`}</h2>
        </div>
        <Link
          href={`/groups/${encodeURIComponent(data.group.id)}/analytics?month=${data.endMonth}&scope=${data.scope}${data.scope === "member" && data.selectedMemberId ? `&member=${data.selectedMemberId}` : ""}`}
        >
          概要分析へ
        </Link>
      </header>

      <section className={styles["details-filters"]}>
        <nav aria-label="期間プリセット" className={styles["details-presets"]}>
          {[3, 6, 12].map((count) => (
            <Link
              href={detailsUrl(
                data,
                analyticsPresetStart(data.endMonth, count),
              )}
              key={count}
            >
              {count}か月
            </Link>
          ))}
        </nav>
        <Form
          action={route}
          aria-label="詳細分析の表示条件"
          className={styles["details-filter-form"]}
        >
          <label>
            開始月
            <input
              defaultValue={data.startMonth}
              name="start"
              required
              type="month"
            />
          </label>
          <label>
            終了月
            <input
              defaultValue={data.endMonth}
              name="end"
              required
              type="month"
            />
          </label>
          <label>
            集計対象
            <select defaultValue={data.scope} name="scope">
              <option value="group">グループ全体</option>
              <option value="self">自分</option>
              <option value="member">指定メンバー</option>
            </select>
          </label>
          <label>
            メンバー
            <select defaultValue={data.selectedMemberId ?? ""} name="member">
              <option value="">選択しない</option>
              {data.members.map((member) => (
                <option key={member.membershipId} value={member.membershipId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="submit">
            表示する
          </button>
        </Form>
        <p className={styles["details-filter-hint"]}>
          グループ・自分を選ぶ場合は、メンバーを「選択しない」にしてください。
        </p>
      </section>

      <section
        aria-label="期間の主要指標"
        className={styles["details-period-summary"]}
      >
        <PeriodMetric
          label="期間の支出"
          value={formatAnalyticsJpy(data.period.expenseTotal)}
        />
        <PeriodMetric
          label="期間の収入"
          value={formatAnalyticsJpy(data.period.incomeTotal)}
        />
        <PeriodMetric
          label="期間の収支"
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
            className={styles["details-table"]}
          >
            <thead>
              <tr>
                {/* 支払額(paidTotal)はDTOに残るが画面へ出さない (AC-TXN-018-4) */}
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
        <table
          aria-label="月別の正確な数値"
          className={`${styles["details-table"]} ${styles["details-table-quad"]}`}
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
                <DetailsAmountCell
                  label="支出"
                  value={formatAnalyticsJpy(month.expenseTotal)}
                />
                <DetailsAmountCell
                  label="収入"
                  value={formatAnalyticsJpy(month.incomeTotal)}
                />
                <DetailsAmountCell
                  label="収支"
                  value={formatAnalyticsSignedJpy(month.balance)}
                />
                <DetailsAmountCell
                  label="累積収支"
                  value={formatAnalyticsSignedJpy(
                    cumulativeByMonth.get(month.month) ?? 0,
                  )}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
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
