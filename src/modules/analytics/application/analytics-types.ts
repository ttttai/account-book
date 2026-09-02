import type { AnalyticsScope } from "../domain/analytics-input";
import type {
  AnalyticsCategoryBreakdown,
  AnalyticsComparison,
  AnalyticsMonthTotals,
} from "../domain/analytics-summary";
import type {
  AnalyticsMemberTotal,
  AnalyticsPeriodTotals,
} from "../domain/analytics-details";

export type AnalyticsSearchInput = Readonly<{
  month?: string | string[];
  scope?: string | string[];
  member?: string | string[];
}>;

export type AnalyticsDetailsSearchInput = Readonly<{
  start?: string | string[];
  end?: string | string[];
  scope?: string | string[];
  member?: string | string[];
}>;

export type AnalyticsMember = Readonly<{
  membershipId: string;
  displayName: string;
  isCurrentUser: boolean;
}>;

export type AnalyticsMetrics = Readonly<{
  expenseTotal: number;
  incomeTotal: number;
  balance: number;
}>;

/** 予算機能が有効な月だけ設定する進捗 (ANA-011)。未実装期間は常に未設定 */
export type AnalyticsBudgetProgress = Readonly<{
  limitMinor: number;
  usedMinor: number;
  remainingMinor: number;
  usedPercent: number;
}>;

export type AnalyticsOverviewReady = Readonly<{
  kind: "ready";
  group: Readonly<{ id: string; name: string }>;
  month: string;
  previousMonth: string;
  nextMonth: string;
  currentMonth: string;
  scope: AnalyticsScope;
  selectedMemberId?: string;
  selectedMemberLabel?: string;
  members: readonly AnalyticsMember[];
  totals: AnalyticsMetrics;
  previousTotals: AnalyticsMetrics;
  expenseComparison: AnalyticsComparison;
  incomeComparison: AnalyticsComparison;
  /** 収支の差額。符号が変わるため比率は表示しない */
  balanceDiffMinor: number;
  categoryBreakdown: AnalyticsCategoryBreakdown;
  hasTransactions: boolean;
  budget?: AnalyticsBudgetProgress;
}>;

export type AnalyticsOverviewInvalid = Readonly<{
  kind: "invalid";
  groupId: string;
  currentMonth: string;
  reason: "invalid_month" | "invalid_scope" | "invalid_member";
}>;

// 表示条件の検証結果に応じて「表示可能」か「不正」のどちらかになる状態union
export type AnalyticsOverviewData =
  AnalyticsOverviewReady | AnalyticsOverviewInvalid;

/** 期間サマリーの集計対象。`self`はサーバー側で操作者のmembershipへ解決する */
export type AnalyticsPeriodTarget =
  | Readonly<{ scope: "group" }>
  | Readonly<{ scope: "self" }>
  | Readonly<{ scope: "member"; memberId: string }>;

export type AnalyticsPeriodRequest = Readonly<{
  groupId: string;
  /** `YYYY-MM` */
  startMonth: string;
  /** `YYYY-MM` */
  endMonth: string;
  target: AnalyticsPeriodTarget;
}>;

export type AnalyticsPeriodSummary = Readonly<{
  group: Readonly<{ id: string; name: string }>;
  scope: AnalyticsScope;
  selectedMemberId?: string;
  months: readonly AnalyticsMonthTotals[];
}>;

export type AnalyticsDetailsReady = Readonly<{
  kind: "ready";
  group: Readonly<{ id: string; name: string }>;
  currentMonth: string;
  startMonth: string;
  endMonth: string;
  scope: AnalyticsScope;
  selectedMemberId?: string;
  selectedMemberLabel?: string;
  members: readonly AnalyticsMember[];
  months: readonly AnalyticsMonthTotals[];
  period: AnalyticsPeriodTotals;
  memberBreakdown: readonly AnalyticsMemberTotal[];
  hasTransactions: boolean;
}>;

export type AnalyticsDetailsInvalid = Readonly<{
  kind: "invalid";
  groupId: string;
  currentMonth: string;
  reason: "invalid_period" | "invalid_scope" | "invalid_member";
}>;

export type AnalyticsDetailsData =
  AnalyticsDetailsReady | AnalyticsDetailsInvalid;
