export type BudgetRevisionStatus = "active" | "disabled";

export type BudgetRevisionCategory = Readonly<{
  id: string;
  name: string;
  color: string;
}>;

export type BudgetCategoryLimit = Readonly<{
  category: BudgetRevisionCategory;
  amountMinor: number;
}>;

/** 適用開始月を持つ予算改定。停止改定は金額と内訳を持たない (BUD-005、BUD-006) */
export type BudgetRevision = Readonly<{
  id: string;
  /** `YYYY-MM` */
  effectiveMonth: string;
  status: BudgetRevisionStatus;
  totalAmountMinor: number | null;
  version: number;
  categoryLimits: readonly BudgetCategoryLimit[];
}>;

// 対象月以前で最も新しい開始月の改定を返す。該当がなければnull（開始月より前の月は予算なし）(AC-BUD-005-1)
// `YYYY-MM`は固定長のため辞書順比較が時系列比較と一致する
export function resolveAppliedBudgetRevision(
  revisions: readonly BudgetRevision[],
  month: string,
): BudgetRevision | null {
  let applied: BudgetRevision | null = null;
  for (const revision of revisions) {
    if (revision.effectiveMonth > month) continue;
    if (!applied || revision.effectiveMonth > applied.effectiveMonth) {
      applied = revision;
    }
  }
  return applied;
}

// 当月と将来月だけを変更可能にする。過去月の改定は作成・変更しない (AC-BUD-001-3)
export function isBudgetMonthEditable(
  month: string,
  currentMonth: string,
): boolean {
  return month >= currentMonth;
}

// `YYYY-MM`を月初日の`YYYY-MM-DD`へ変換する（DBのdate列は月初日で保持する）
export function monthToFirstDay(month: string): string {
  return `${month}-01`;
}

// DBの月初日`YYYY-MM-DD`を`YYYY-MM`へ戻す
export function firstDayToMonth(date: string): string {
  return date.slice(0, 7);
}
