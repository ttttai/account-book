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
import { AnalyticsCategoryChart } from "./analytics-category-chart";
import { AnalyticsDetailsFold } from "./analytics-details-fold";
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

// 詳細分析の集計結果を「期間指標 → カテゴリ → 月別推移（支出・収入・貯金額）→ 折りたたみ（メンバー別・数値表）」の順に認可済みDTOから描く (ANA-017)
export function AnalyticsDetailsSections({
  data,
}: Readonly<{ data: AnalyticsDetailsReady }>) {
  const cumulativeByMonth = new Map(
    data.cumulativeBalances.map((item) => [item.month, item.cumulativeBalance]),
  );
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

      <section
        aria-label="支出カテゴリ構成"
        className={styles["details-panel"]}
        data-details-section="category"
      >
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

      <section
        aria-label="月別推移"
        className={styles["details-panel"]}
        data-details-section="trend"
      >
        <AnalyticsMonthlyTrendChart
          months={data.months.map((month) => ({
            month: month.month,
            expenseTotal: month.expenseTotal,
            incomeTotal: month.incomeTotal,
            cumulativeBalance: cumulativeByMonth.get(month.month) ?? 0,
          }))}
        />
      </section>

      {data.scope === "group" ? (
        <AnalyticsDetailsFold
          defaultOpen
          heading="メンバー別"
          id="analytics-details-members"
        >
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
        </AnalyticsDetailsFold>
      ) : null}

      <AnalyticsDetailsFold
        defaultOpen={false}
        heading="月別の正確な数値"
        id="analytics-details-months"
        wide
      >
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
      </AnalyticsDetailsFold>
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
