import type { BudgetProgress } from "../domain/budget-progress";
import type { BudgetRevisionStatus } from "../domain/budget-revision";

export type BudgetSearchInput = Readonly<{
  month?: string | string[];
}>;

export type BudgetCategoryOption = Readonly<{
  id: string;
  name: string;
  color: string;
}>;

export type BudgetRevisionSummary = Readonly<{
  /** `YYYY-MM` */
  effectiveMonth: string;
  status: BudgetRevisionStatus;
  /** 停止改定はnull */
  totalAmountMinor: number | null;
}>;

// 予算画面が必要とする最小DTO。DB行・ユーザーID・tokenをClientへ渡さない
export type BudgetViewReady = Readonly<{
  kind: "ready";
  group: Readonly<{ id: string; name: string }>;
  month: string;
  previousMonth: string;
  nextMonth: string;
  currentMonth: string;
  /** owner/adminだけがtrue (AC-BUD-001-1) */
  canManage: boolean;
  /** 当月以降だけtrue (AC-BUD-001-3) */
  canEditMonth: boolean;
  /** 選択月に有効な予算がある場合だけ設定する */
  progress: BudgetProgress | null;
  /** 選択月に適用される改定（停止改定を含む）。開始月より前の月はnull */
  appliedRevision: Readonly<{
    effectiveMonth: string;
    status: BudgetRevisionStatus;
    version: number;
  }> | null;
  /** 選択月をちょうど開始月とする改定。更新時のexpectedVersionに使う */
  revisionAtMonth: Readonly<{
    version: number;
    status: BudgetRevisionStatus;
  }> | null;
  /** 新しい順の改定履歴 */
  history: readonly BudgetRevisionSummary[];
  /** フォームで内訳を設定できるアクティブな支出カテゴリ */
  expenseCategories: readonly BudgetCategoryOption[];
}>;

export type BudgetViewInvalid = Readonly<{
  kind: "invalid";
  groupId: string;
  currentMonth: string;
  reason: "invalid_month";
}>;

// 表示条件の検証結果に応じて「表示可能」か「不正」のどちらかになる状態union
export type BudgetView = BudgetViewReady | BudgetViewInvalid;

export type BudgetCommandResult =
  | Readonly<{ kind: "ok" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "error" }>;
