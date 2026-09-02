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

// 期間・対象filterと、推移・カテゴリ・メンバー別統計を数値中心で表示する
export function AnalyticsDetails({
  data,
}: Readonly<{ data: AnalyticsDetailsReady }>) {
  const route = `/groups/${encodeURIComponent(data.group.id)}/analytics/details`;
  const maxMonthlyAmount = Math.max(
    1,
    ...data.months.flatMap((month) => [month.expenseTotal, month.incomeTotal]),
  );

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

      <section className={styles["details-panel"]}>
        <h3>月別推移</h3>
        <ul aria-label="月別推移" className={styles["details-trend-list"]}>
          {data.months.map((month) => (
            <li key={month.month}>
              <strong>{formatAnalyticsMonth(month.month)}</strong>
              <span>{`支出 ${formatAnalyticsJpy(month.expenseTotal)}`}</span>
              <i
                aria-hidden="true"
                data-details-bar="expense"
                style={{
                  width: `${(month.expenseTotal / maxMonthlyAmount) * 100}%`,
                }}
              />
              <span>{`収入 ${formatAnalyticsJpy(month.incomeTotal)}`}</span>
              <i
                aria-hidden="true"
                data-details-bar="income"
                style={{
                  width: `${(month.incomeTotal / maxMonthlyAmount) * 100}%`,
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles["details-panel"]}>
        <h3>支出カテゴリ構成</h3>
        {data.period.expenseByCategory.length > 0 ? (
          <ul
            aria-label="期間の支出カテゴリ"
            className={styles["details-category-list"]}
          >
            {data.period.expenseByCategory.map((category) => (
              <li key={category.categoryId}>
                <span>{category.name}</span>
                <strong>{formatAnalyticsJpy(category.amountMinor)}</strong>
                <span>{`${category.sharePercent}%`}</span>
                <i
                  aria-hidden="true"
                  data-category-color={category.color}
                  data-details-bar="category"
                  style={{ width: `${Math.max(category.sharePercent, 2)}%` }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles["details-muted"]}>支出はありません。</p>
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
                <th>メンバー</th>
                <th>負担額</th>
                <th>支払額</th>
                <th>受取額</th>
              </tr>
            </thead>
            <tbody>
              {data.memberBreakdown.map((member) => (
                <tr key={member.membershipId}>
                  <th>{member.displayName}</th>
                  <td>{formatAnalyticsJpy(member.usageTotal)}</td>
                  <td>{formatAnalyticsJpy(member.paidTotal)}</td>
                  <td>{formatAnalyticsJpy(member.receivedTotal)}</td>
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
          className={styles["details-table"]}
        >
          <thead>
            <tr>
              <th>月</th>
              <th>支出</th>
              <th>収入</th>
              <th>収支</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((month) => (
              <tr key={month.month}>
                <th>{formatAnalyticsMonth(month.month)}</th>
                <td>{formatAnalyticsJpy(month.expenseTotal)}</td>
                <td>{formatAnalyticsJpy(month.incomeTotal)}</td>
                <td>{formatAnalyticsSignedJpy(month.balance)}</td>
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
