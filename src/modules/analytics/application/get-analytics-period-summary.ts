import "server-only";

import { resolveGroupReadContext } from "@/modules/groups/server";

import { listAnalyticsMonths } from "../domain/analytics-month";
import { resolveAnalyticsTarget } from "./analytics-context";
import type {
  AnalyticsPeriodRequest,
  AnalyticsPeriodSummary,
} from "./analytics-types";
import { loadAnalyticsMonths } from "./load-analytics-months";

// 詳細分析と定期レポートが再利用する認可済みの期間サマリー (ANA-012)
// 概要分析と同じ内部集計処理を共有するため、同じ入力に対して同じ金額を返す
// 1〜24か月以外、不正な月、逆順の期間は取引を読まずにnullを返す (AC-ANA-012-2)
export async function getAnalyticsPeriodSummary(
  request: AnalyticsPeriodRequest,
): Promise<AnalyticsPeriodSummary | null> {
  const months = listAnalyticsMonths(request.startMonth, request.endMonth);
  if (!months) return null;

  const context = await resolveGroupReadContext(request.groupId);
  if (!context) return null;

  const target = resolveAnalyticsTarget(context, request.target);
  if (!target) return null;

  const monthlyTotals = await loadAnalyticsMonths(context, months, target);

  return {
    group: { id: context.group.id, name: context.group.name },
    scope: request.target.scope,
    ...(target.scope === "member" ? { selectedMemberId: target.memberId } : {}),
    months: monthlyTotals,
  };
}
