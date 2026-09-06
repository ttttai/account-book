import Link from "next/link";

import { formatAnalyticsJpy, formatAnalyticsMonth } from "@/modules/analytics";

import type {
  BudgetViewInvalid,
  BudgetViewReady,
} from "../application/budget-types";
import {
  BUDGET_STATUS_LABELS,
  type BudgetCategoryProgress,
  type BudgetProgress,
  type BudgetStatus,
} from "../domain/budget-progress";

import styles from "./budgets.module.css";

// 月をquery文字列にした予算画面URLを組み立てる
export function createBudgetUrl(groupId: string, month: string): string {
  return `/groups/${encodeURIComponent(groupId)}/budgets?month=${month}`;
}

// 残額は正のときそのまま、超過時は「超過 ￥x」と明示して色だけに依存しない (AC-BUD-007-2)
function remainingText(remainingMinor: number): string {
  if (remainingMinor < 0) return `超過 ${formatAnalyticsJpy(-remainingMinor)}`;
  return formatAnalyticsJpy(remainingMinor);
}

// 進捗バーは装飾。100%で切り詰め、数値とラベルで同じ内容を伝える
function BudgetBar({
  usedPercent,
  status,
}: Readonly<{ usedPercent: number; status: BudgetStatus }>) {
  return (
    <span
      aria-hidden="true"
      className={styles["budget-bar"]}
      data-budget-bar=""
      data-status={status}
    >
      <span style={{ width: `${Math.min(Math.max(usedPercent, 0), 100)}%` }} />
    </span>
  );
}

function StatusBadge({ status }: Readonly<{ status: BudgetStatus }>) {
  return (
    <span className={styles["budget-status"]} data-status={status}>
      {BUDGET_STATUS_LABELS[status]}
    </span>
  );
}

// グループ予算の予算額・実績・残額・消化率・状態ラベルと適用開始月 (AC-BUD-003-1、AC-BUD-007-1)
function BudgetSummary({ progress }: Readonly<{ progress: BudgetProgress }>) {
  return (
    <section
      aria-label="グループ予算"
      className={styles["budget-summary"]}
      data-status={progress.status}
    >
      <div className={styles["budget-summary-heading"]}>
        <p className={styles["budget-summary-label"]}>グループ予算</p>
        <StatusBadge status={progress.status} />
      </div>
      <strong className={styles["budget-summary-limit"]}>
        {formatAnalyticsJpy(progress.limitMinor)}
      </strong>
      <p className={styles["budget-summary-note"]}>
        {formatAnalyticsMonth(progress.effectiveMonth)}から適用
      </p>
      <BudgetBar status={progress.status} usedPercent={progress.usedPercent} />
      <dl className={styles["budget-metrics"]}>
        <div>
          <dt>実績</dt>
          <dd>{formatAnalyticsJpy(progress.usedMinor)}</dd>
        </div>
        <div>
          <dt>残額</dt>
          <dd>{remainingText(progress.remainingMinor)}</dd>
        </div>
        <div>
          <dt>消化率</dt>
          <dd>{`${progress.usedPercent}%`}</dd>
        </div>
      </dl>
    </section>
  );
}

// カテゴリ1件の予算・実績・残額・消化率・状態。横スクロールする表ではなく縦一覧の1行 (AC-BUD-010-2)
function BudgetCategoryRow({
  category,
}: Readonly<{ category: BudgetCategoryProgress }>) {
  return (
    <li className={styles["budget-category-row"]} data-status={category.status}>
      <p className={styles["budget-category-head"]}>
        <span
          className={styles["budget-category-color"]}
          data-category-color={category.color}
        />
        <span className={styles["budget-category-name"]}>{category.name}</span>
        <StatusBadge status={category.status} />
      </p>
      <BudgetBar status={category.status} usedPercent={category.usedPercent} />
      <dl className={styles["budget-category-metrics"]}>
        <div>
          <dt>予算</dt>
          <dd>{formatAnalyticsJpy(category.limitMinor)}</dd>
        </div>
        <div>
          <dt>実績</dt>
          <dd>{formatAnalyticsJpy(category.usedMinor)}</dd>
        </div>
        <div>
          <dt>残額</dt>
          <dd>{remainingText(category.remainingMinor)}</dd>
        </div>
        <div>
          <dt>消化率</dt>
          <dd>{`${category.usedPercent}%`}</dd>
        </div>
      </dl>
    </li>
  );
}

function BudgetCategories({
  progress,
}: Readonly<{ progress: BudgetProgress }>) {
  return (
    <section className={styles["budget-panel"]}>
      <h3>カテゴリ別予算</h3>
      {progress.categories.length > 0 ? (
        <ul
          aria-label="カテゴリ別予算"
          className={styles["budget-category-list"]}
        >
          {progress.categories.map((category) => (
            <BudgetCategoryRow category={category} key={category.categoryId} />
          ))}
        </ul>
      ) : (
        <p className={styles["budget-muted"]}>
          カテゴリ別の予算は設定されていません。
        </p>
      )}
      <p className={styles["budget-unallocated"]}>
        {`未配分 ${formatAnalyticsJpy(progress.unallocatedMinor)}`}
      </p>
    </section>
  );
}

// 改定履歴。停止改定は金額の代わりに「停止」と示す (AC-BUD-006-1)
function BudgetHistory({ view }: Readonly<{ view: BudgetViewReady }>) {
  if (view.history.length === 0) return null;
  return (
    <section aria-label="改定履歴" className={styles["budget-panel"]}>
      <h3>改定履歴</h3>
      <ul className={styles["budget-history"]}>
        {view.history.map((revision) => (
          <li key={revision.effectiveMonth}>
            <span>{`${formatAnalyticsMonth(revision.effectiveMonth)}から`}</span>
            <strong>
              {revision.status === "disabled" ||
              revision.totalAmountMinor === null
                ? "停止"
                : formatAnalyticsJpy(revision.totalAmountMinor)}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 月移動、グループ予算、カテゴリ内訳、改定履歴を縦に並べた予算画面の閲覧部分（Server Component）
export function BudgetOverview({ view }: Readonly<{ view: BudgetViewReady }>) {
  return (
    <>
      <header className={styles["budget-month-navigation"]}>
        <Link
          aria-label={`${formatAnalyticsMonth(view.previousMonth)}を表示`}
          href={createBudgetUrl(view.group.id, view.previousMonth)}
        >
          ‹
        </Link>
        <div>
          <p className="eyebrow">月間予算</p>
          <h2>{formatAnalyticsMonth(view.month)}</h2>
        </div>
        <Link
          aria-label={`${formatAnalyticsMonth(view.nextMonth)}を表示`}
          href={createBudgetUrl(view.group.id, view.nextMonth)}
        >
          ›
        </Link>
      </header>

      {view.progress ? (
        <>
          <BudgetSummary progress={view.progress} />
          <BudgetCategories progress={view.progress} />
        </>
      ) : (
        <section className={styles["budget-empty"]}>
          <p className={styles["budget-empty-title"]}>
            この月には予算が設定されていません。
          </p>
          <p className={styles["budget-muted"]}>
            予算を設定すると、この月の支出の上限に対する実績・残額・消化率を確認できます。予算を超えても取引の登録は妨げません。
          </p>
        </section>
      )}

      <BudgetHistory view={view} />
    </>
  );
}

// 表示条件が不正なときのエラー表示と、当月へ戻るリンク (AC-BUD-003-2)
export function BudgetValidationError({
  data,
}: Readonly<{ data: BudgetViewInvalid }>) {
  return (
    <section className="calendar-validation-error" role="alert">
      <p className="eyebrow">表示条件を確認してください</p>
      <h2>予算を表示できません</h2>
      <p>月の指定が正しくありません。予算と取引データは読み込んでいません。</p>
      <Link
        className="primary-link"
        href={createBudgetUrl(data.groupId, data.currentMonth)}
      >
        今月の予算へ戻る
      </Link>
    </section>
  );
}
