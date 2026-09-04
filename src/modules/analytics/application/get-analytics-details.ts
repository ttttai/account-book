import "server-only";

import { resolveGroupReadContext } from "@/modules/groups/server";

import {
  aggregateAnalyticsMembers,
  summarizeAnalyticsPeriod,
} from "../domain/analytics-details";
import { parseAnalyticsDetailsSelection } from "../domain/analytics-details-input";
import { listAnalyticsMonths } from "../domain/analytics-month";
import { accumulateAnalyticsBalance } from "../domain/analytics-savings";
import {
  loadAnalyticsMembers,
  resolveAnalyticsTarget,
} from "./analytics-context";
import type {
  AnalyticsDetailsData,
  AnalyticsDetailsSearchInput,
} from "./analytics-types";
import {
  aggregateAnalyticsMonths,
  loadAnalyticsTransactionInputs,
} from "./load-analytics-months";

// 詳細分析の期間指標・推移・カテゴリ・メンバー比較を1回の月次読み取りから返す
export async function getAnalyticsDetails(
  groupId: string,
  search: AnalyticsDetailsSearchInput,
): Promise<AnalyticsDetailsData | null> {
  const context = await resolveGroupReadContext(groupId);
  if (!context) return null;

  const selection = parseAnalyticsDetailsSelection(
    search,
    context.currentMonth,
  );
  if (!selection.success) {
    return {
      kind: "invalid",
      groupId,
      currentMonth: context.currentMonth,
      reason: selection.reason,
    };
  }
  const target = resolveAnalyticsTarget(
    context,
    selection.value.scope === "group"
      ? { scope: "group" }
      : selection.value.scope === "self"
        ? { scope: "self" }
        : {
            scope: "member",
            memberId: selection.value.memberId ?? "",
          },
  );
  if (!target) {
    return {
      kind: "invalid",
      groupId,
      currentMonth: context.currentMonth,
      reason: "invalid_member",
    };
  }

  const months = listAnalyticsMonths(
    selection.value.startMonth,
    selection.value.endMonth,
  );
  if (!months) throw new Error("validated analytics period is invalid");

  const [members, inputs] = await Promise.all([
    loadAnalyticsMembers(context),
    loadAnalyticsTransactionInputs(context, months),
  ]);
  const monthlyTotals = aggregateAnalyticsMonths(months, inputs, target);
  const period = summarizeAnalyticsPeriod(monthlyTotals);
  const selectedMember =
    target.scope === "member"
      ? members.find((member) => member.membershipId === target.memberId)
      : undefined;

  return {
    kind: "ready",
    group: { id: context.group.id, name: context.group.name },
    currentMonth: context.currentMonth,
    startMonth: selection.value.startMonth,
    endMonth: selection.value.endMonth,
    scope: selection.value.scope,
    ...(target.scope === "member"
      ? {
          selectedMemberId: target.memberId,
          selectedMemberLabel: selectedMember?.displayName,
        }
      : {}),
    members,
    months: monthlyTotals,
    period,
    memberBreakdown:
      selection.value.scope === "group"
        ? aggregateAnalyticsMembers(members, inputs.expenses, inputs.incomes)
        : [],
    cumulativeBalances: accumulateAnalyticsBalance(monthlyTotals),
    hasTransactions: period.expenseTotal > 0 || period.incomeTotal > 0,
  };
}
