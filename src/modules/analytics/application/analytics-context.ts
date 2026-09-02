import "server-only";

import {
  type GroupReadContext,
  loadGroupMembers,
} from "@/modules/groups/server";

import type { AnalyticsTarget } from "../domain/analytics-summary";
import type { AnalyticsMember, AnalyticsPeriodTarget } from "./analytics-types";

// 集計対象を、同じグループのアクティブmembershipだけを許可して解決する (AC-ANA-001-2)
// 認証・所属確認は共有の`resolveGroupReadContext`で済ませ、ここでは対象の妥当性だけを判定する
export function resolveAnalyticsTarget(
  context: GroupReadContext,
  target: AnalyticsPeriodTarget,
): AnalyticsTarget | null {
  if (target.scope === "group") return { scope: "group" };
  const memberId =
    target.scope === "self" ? context.currentMembershipId : target.memberId;
  const isActiveMember = context.memberships.some(
    (membership) =>
      membership.membershipId === memberId && membership.status === "active",
  );
  if (!isActiveMember) return null;
  return { scope: "member", memberId };
}

// 集計対象の切替に使う表示名だけを解決する。DB行はDTOへ渡さない
export async function loadAnalyticsMembers(
  context: GroupReadContext,
): Promise<readonly AnalyticsMember[]> {
  const members = await loadGroupMembers(context);
  return members.map((member) => ({
    membershipId: member.membershipId,
    displayName: member.displayName,
    isCurrentUser: member.isCurrentUser,
  }));
}
