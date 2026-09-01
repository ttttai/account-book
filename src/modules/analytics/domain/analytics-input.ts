import { z } from "zod";

import { isAnalyticsMonth } from "./analytics-month";

export type AnalyticsScope = "group" | "self" | "member";

export type AnalyticsSelection = Readonly<{
  month: string;
  scope: AnalyticsScope;
  memberId?: string;
}>;

export type AnalyticsSelectionReason =
  "invalid_month" | "invalid_scope" | "invalid_member";

export type AnalyticsSelectionResult =
  | Readonly<{ success: true; value: AnalyticsSelection }>
  | Readonly<{ success: false; reason: AnalyticsSelectionReason }>;

type AnalyticsSearchInput = Readonly<{
  month?: unknown;
  scope?: unknown;
  member?: unknown;
}>;

const uuidSchema = z.uuid();
const scopes: readonly AnalyticsScope[] = ["group", "self", "member"];

// 未指定はundefined、文字列以外（配列など）はnullを返して不正扱いにする
function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

// search paramsのmonth/scope/memberを検証し、概要分析の表示条件へ変換する (AC-ANA-005-2)
export function parseAnalyticsSelection(
  input: AnalyticsSearchInput,
  currentMonth: string,
): AnalyticsSelectionResult {
  const monthValue = optionalString(input.month);
  if (monthValue === null) return { success: false, reason: "invalid_month" };
  const month = monthValue ?? currentMonth;
  if (!isAnalyticsMonth(month)) {
    return { success: false, reason: "invalid_month" };
  }

  const scopeValue = optionalString(input.scope);
  if (scopeValue === null) return { success: false, reason: "invalid_scope" };
  const scope = (scopeValue ?? "group") as AnalyticsScope;
  if (!scopes.includes(scope)) {
    return { success: false, reason: "invalid_scope" };
  }

  const member = optionalString(input.member);
  if (member === null) return { success: false, reason: "invalid_member" };
  if (scope === "member") {
    if (!member || !uuidSchema.safeParse(member).success) {
      return { success: false, reason: "invalid_member" };
    }
  } else if (member !== undefined) {
    // 集計対象と一致しないmember指定は、暗黙に無視せず不正として扱う
    return { success: false, reason: "invalid_member" };
  }

  return {
    success: true,
    value: {
      month,
      scope,
      ...(scope === "member" && member ? { memberId: member } : {}),
    },
  };
}
