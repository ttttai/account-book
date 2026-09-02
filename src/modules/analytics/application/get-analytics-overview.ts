import "server-only";

import { resolveGroupReadContext } from "@/modules/groups/server";

import { parseAnalyticsSelection } from "../domain/analytics-input";
import { shiftAnalyticsMonth } from "../domain/analytics-month";
import {
  compareAnalyticsAmount,
  summarizeCategoryBreakdown,
} from "../domain/analytics-summary";
import {
  loadAnalyticsMembers,
  resolveAnalyticsTarget,
} from "./analytics-context";
import type {
  AnalyticsMetrics,
  AnalyticsOverviewData,
  AnalyticsSearchInput,
} from "./analytics-types";
import { loadAnalyticsMonths } from "./load-analytics-months";

function toMetrics(
  totals: Readonly<{
    expenseTotal: number;
    incomeTotal: number;
    balance: number;
  }>,
): AnalyticsMetrics {
  return {
    expenseTotal: totals.expenseTotal,
    incomeTotal: totals.incomeTotal,
    balance: totals.balance,
  };
}

// 認証・所属確認と表示条件の検証を行い、概要分析画面の表示データ一式を取得する
// 検証に失敗した場合は取引を読み込まず、検証エラー状態を返す (AC-ANA-005-2)
export async function getAnalyticsOverview(
  unsafeGroupId: string,
  search: AnalyticsSearchInput,
): Promise<AnalyticsOverviewData | null> {
  const context = await resolveGroupReadContext(unsafeGroupId);
  if (!context) return null;

  const invalid = (
    reason: "invalid_month" | "invalid_scope" | "invalid_member",
  ) =>
    ({
      kind: "invalid",
      groupId: context.group.id,
      currentMonth: context.currentMonth,
      reason,
    }) as const;

  const selectionResult = parseAnalyticsSelection(search, context.currentMonth);
  if (!selectionResult.success) return invalid(selectionResult.reason);

  const selection = selectionResult.value;
  const target = resolveAnalyticsTarget(
    context,
    selection.scope === "member" && selection.memberId
      ? { scope: "member", memberId: selection.memberId }
      : { scope: selection.scope === "self" ? "self" : "group" },
  );
  if (!target) return invalid("invalid_member");

  const previousMonth = shiftAnalyticsMonth(selection.month, -1);
  const [monthlyTotals, members] = await Promise.all([
    loadAnalyticsMonths(context, [previousMonth, selection.month], target),
    loadAnalyticsMembers(context),
  ]);
  const previous = monthlyTotals[0];
  const current = monthlyTotals[1];
  if (!previous || !current) {
    throw new Error("分析データを取得できませんでした。");
  }

  const totals = toMetrics(current);
  const previousTotals = toMetrics(previous);
  const selectedMemberLabel =
    target.scope === "member"
      ? members.find((member) => member.membershipId === target.memberId)
          ?.displayName
      : undefined;

  return {
    kind: "ready",
    group: { id: context.group.id, name: context.group.name },
    month: selection.month,
    previousMonth,
    nextMonth: shiftAnalyticsMonth(selection.month, 1),
    currentMonth: context.currentMonth,
    scope: selection.scope,
    ...(selection.memberId ? { selectedMemberId: selection.memberId } : {}),
    ...(selectedMemberLabel ? { selectedMemberLabel } : {}),
    members,
    totals,
    previousTotals,
    expenseComparison: compareAnalyticsAmount(
      totals.expenseTotal,
      previousTotals.expenseTotal,
    ),
    incomeComparison: compareAnalyticsAmount(
      totals.incomeTotal,
      previousTotals.incomeTotal,
    ),
    balanceDiffMinor: totals.balance - previousTotals.balance,
    categoryBreakdown: summarizeCategoryBreakdown(
      current.expenseByCategory,
      current.expenseTotal,
    ),
    hasTransactions:
      totals.expenseTotal > 0 ||
      totals.incomeTotal > 0 ||
      current.expenseByCategory.length > 0,
    // 予算（BUD-*）は未実装のため、値がない月は予算領域を表示しない (AC-ANA-011-1)
  };
}
