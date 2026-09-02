import Link from "next/link";

import type {
  AnalyticsBudgetProgress,
  AnalyticsOverviewInvalid,
  AnalyticsOverviewReady,
} from "../application/analytics-types";
import type { AnalyticsScope } from "../domain/analytics-input";
import {
  formatAnalyticsJpy,
  formatAnalyticsPercent,
  formatAnalyticsSignedJpy,
} from "../domain/analytics-jpy";
import { formatAnalyticsMonth } from "../domain/analytics-month";
import { analyticsPresetStart } from "../domain/analytics-details-input";
import type {
  AnalyticsCategoryShare,
  AnalyticsComparison,
} from "../domain/analytics-summary";

import styles from "./analytics.module.css";

// 月・集計対象をquery文字列にした概要分析URLを組み立てる (AC-ANA-005-1)
function createAnalyticsUrl(
  groupId: string,
  input: Readonly<{ month: string; scope: AnalyticsScope; memberId?: string }>,
): string {
  const search = new URLSearchParams({
    month: input.month,
    scope: input.scope,
  });
  if (input.scope === "member" && input.memberId) {
    search.set("member", input.memberId);
  }
  return `/groups/${encodeURIComponent(groupId)}/analytics?${search.toString()}`;
}

// 前月との差額と、比較可能な場合だけ前月比を1行のテキストで示す (AC-ANA-003-1、AC-ANA-003-2)
function comparisonText(comparison: AnalyticsComparison): string {
  const diff = formatAnalyticsSignedJpy(comparison.diffMinor);
  const ratio =
    comparison.changePercent === null
      ? "比較なし"
      : formatAnalyticsPercent(comparison.changePercent);
  return `前月比 ${diff}（${ratio}）`;
}

type MetricProps = Readonly<{
  label: string;
  amountText: string;
  comparisonText: string;
  isPrimary?: boolean;
  isNegative?: boolean;
}>;

// 1指標の金額と前月比較。金額は省略せず、増減は符号で示して色に依存させない
function AnalyticsMetric({
  label,
  amountText,
  comparisonText: comparison,
  isPrimary = false,
  isNegative = false,
}: MetricProps) {
  const className = [
    styles["analytics-metric"],
    isPrimary ? styles["is-primary"] : "",
    isNegative ? styles["is-negative"] : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldsetはform制御のグループ化用であり、金額と前月比の読み上げ単位にはARIAのgroupを使う
    <div aria-label={label} className={className} role="group">
      <p className={styles["analytics-metric-label"]}>{label}</p>
      <strong className={styles["analytics-metric-amount"]}>
        {amountText}
      </strong>
      <p className={styles["analytics-metric-comparison"]}>{comparison}</p>
    </div>
  );
}

// 予算値がある月だけ表示する進捗 (AC-ANA-011-1)
function AnalyticsBudget({
  budget,
}: Readonly<{ budget: AnalyticsBudgetProgress }>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 予算進捗もform制御ではないため、fieldsetではなくARIAのgroupで読み上げ単位を示す
    <div aria-label="予算" className={styles["analytics-budget"]} role="group">
      <p className={styles["analytics-metric-label"]}>予算</p>
      <p className={styles["analytics-budget-limit"]}>
        {`予算 ${formatAnalyticsJpy(budget.limitMinor)}`}
      </p>
      <p className={styles["analytics-budget-progress"]}>
        {`残り ${formatAnalyticsJpy(Math.max(budget.remainingMinor, 0))}（消化 ${budget.usedPercent}%）`}
      </p>
    </div>
  );
}

type BreakdownRowProps = Readonly<{
  name: string;
  color?: string;
  amountMinor: number;
  sharePercent: number;
  note?: string;
}>;

// カテゴリ1件の行。棒は装飾とし、名称・金額・構成比のテキストで同じ値を伝える (AC-ANA-009-1)
function AnalyticsBreakdownRow({
  name,
  color,
  amountMinor,
  sharePercent,
  note,
}: BreakdownRowProps) {
  return (
    <li className={styles["analytics-category-row"]}>
      <p className={styles["analytics-category-head"]}>
        <span className={styles["analytics-category-name"]}>{name}</span>
        <span className={styles["analytics-category-amount"]}>
          {formatAnalyticsJpy(amountMinor)}
        </span>
      </p>
      <span
        aria-hidden="true"
        className={styles["analytics-category-bar"]}
        data-analytics-bar=""
        data-category-color={color}
        style={{ width: `${Math.min(Math.max(sharePercent, 2), 100)}%` }}
      />
      <p className={styles["analytics-category-note"]}>
        {note ? `${sharePercent}% ・ ${note}` : `${sharePercent}%`}
      </p>
    </li>
  );
}

// 月移動・集計対象・指標・カテゴリ内訳を縦に並べた概要分析画面
export function AnalyticsOverview({
  data,
}: Readonly<{ data: AnalyticsOverviewReady }>) {
  const groupBase = `/groups/${encodeURIComponent(data.group.id)}`;
  const sharedSelection = {
    scope: data.scope,
    ...(data.selectedMemberId ? { memberId: data.selectedMemberId } : {}),
  } as const;
  const currentMembership = data.members.find((member) => member.isCurrentUser);
  const isSelfActive =
    data.scope === "self" ||
    (data.scope === "member" &&
      data.selectedMemberId === currentMembership?.membershipId);
  const targetLabel =
    data.scope === "group"
      ? "グループ全体"
      : `${data.selectedMemberLabel ?? currentMembership?.displayName ?? "自分"}`;
  const calendarUrl = `${groupBase}?month=${data.month}&scope=${data.scope === "member" && data.selectedMemberId ? `member&member=${data.selectedMemberId}` : data.scope}`;

  return (
    <div className={styles["analytics-layout"]}>
      <header className={styles["analytics-month-navigation"]}>
        <Link
          aria-label={`${formatAnalyticsMonth(data.previousMonth)}を表示`}
          href={createAnalyticsUrl(data.group.id, {
            month: data.previousMonth,
            ...sharedSelection,
          })}
        >
          ‹
        </Link>
        <div>
          <p className="eyebrow">月間サマリー</p>
          <h2>{formatAnalyticsMonth(data.month)}</h2>
        </div>
        <Link
          aria-label={`${formatAnalyticsMonth(data.nextMonth)}を表示`}
          href={createAnalyticsUrl(data.group.id, {
            month: data.nextMonth,
            ...sharedSelection,
          })}
        >
          ›
        </Link>
      </header>

      <nav
        aria-label="分析の集計対象"
        className={styles["analytics-scope-nav"]}
      >
        <Link
          aria-current={data.scope === "group" ? "page" : undefined}
          className={data.scope === "group" ? "is-active" : undefined}
          href={createAnalyticsUrl(data.group.id, {
            month: data.month,
            scope: "group",
          })}
        >
          グループ
        </Link>
        <Link
          aria-current={isSelfActive ? "page" : undefined}
          className={isSelfActive ? "is-active" : undefined}
          href={createAnalyticsUrl(data.group.id, {
            month: data.month,
            scope: "self",
          })}
        >
          自分
        </Link>
        {data.members
          .filter((member) => !member.isCurrentUser)
          .map((member) => {
            const isActive = data.selectedMemberId === member.membershipId;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "is-active" : undefined}
                href={createAnalyticsUrl(data.group.id, {
                  month: data.month,
                  scope: "member",
                  memberId: member.membershipId,
                })}
                key={member.membershipId}
              >
                {member.displayName}
              </Link>
            );
          })}
      </nav>

      <section
        aria-label={`${targetLabel}の月間指標`}
        className={styles["analytics-metrics"]}
      >
        <AnalyticsMetric
          amountText={formatAnalyticsJpy(data.totals.expenseTotal)}
          comparisonText={comparisonText(data.expenseComparison)}
          isPrimary
          label="支出"
        />
        <AnalyticsMetric
          amountText={formatAnalyticsJpy(data.totals.incomeTotal)}
          comparisonText={comparisonText(data.incomeComparison)}
          label="収入"
        />
        <AnalyticsMetric
          amountText={formatAnalyticsSignedJpy(data.totals.balance)}
          comparisonText={`前月比 ${formatAnalyticsSignedJpy(data.balanceDiffMinor)}`}
          isNegative={data.totals.balance < 0}
          label="収支"
        />
      </section>

      {data.budget ? <AnalyticsBudget budget={data.budget} /> : null}

      {data.categoryBreakdown.top.length > 0 ? (
        <section className={styles["analytics-category"]}>
          <h3>支出カテゴリ</h3>
          <ul
            aria-label="支出カテゴリの内訳"
            className={styles["analytics-category-list"]}
          >
            {data.categoryBreakdown.top.map(
              (category: AnalyticsCategoryShare) => (
                <AnalyticsBreakdownRow
                  amountMinor={category.amountMinor}
                  color={category.color}
                  key={category.categoryId}
                  name={category.name}
                  sharePercent={category.sharePercent}
                />
              ),
            )}
            {data.categoryBreakdown.others ? (
              <AnalyticsBreakdownRow
                amountMinor={data.categoryBreakdown.others.amountMinor}
                name="その他のカテゴリ"
                note={`${data.categoryBreakdown.others.categoryCount}件`}
                sharePercent={data.categoryBreakdown.others.sharePercent}
              />
            ) : null}
          </ul>
        </section>
      ) : (
        <p className={styles["analytics-empty-message"]}>
          この月の取引はまだありません。
        </p>
      )}

      <nav aria-label="関連する画面" className={styles["analytics-links"]}>
        <Link
          href={`${groupBase}/analytics/details?start=${analyticsPresetStart(data.month, 6)}&end=${data.month}&scope=${data.scope}${data.scope === "member" && data.selectedMemberId ? `&member=${data.selectedMemberId}` : ""}`}
        >
          詳細な統計を見る
        </Link>
        <Link href={calendarUrl}>この月のカレンダーを見る</Link>
        <Link href={`${groupBase}/history?month=${data.month}`}>
          この月の履歴を見る
        </Link>
      </nav>
    </div>
  );
}

// 表示条件が不正なときのエラー表示と、当月・グループ表示へ戻るリンク (AC-ANA-005-2)
export function AnalyticsValidationError({
  data,
}: Readonly<{ data: AnalyticsOverviewInvalid }>) {
  return (
    <section className="calendar-validation-error" role="alert">
      <p className="eyebrow">表示条件を確認してください</p>
      <h2>分析を表示できません</h2>
      <p>
        月、集計対象またはメンバーの指定が正しくありません。取引データは読み込んでいません。
      </p>
      <Link
        className="primary-link"
        href={createAnalyticsUrl(data.groupId, {
          month: data.currentMonth,
          scope: "group",
        })}
      >
        今月のグループ表示へ戻る
      </Link>
    </section>
  );
}
