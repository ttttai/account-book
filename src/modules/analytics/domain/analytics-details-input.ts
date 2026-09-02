import { z } from "zod";

import type { AnalyticsScope } from "./analytics-input";
import {
  isAnalyticsMonth,
  listAnalyticsMonths,
  shiftAnalyticsMonth,
} from "./analytics-month";

export type AnalyticsDetailsSelection = Readonly<{
  startMonth: string;
  endMonth: string;
  scope: AnalyticsScope;
  memberId?: string;
}>;

export type AnalyticsDetailsSelectionResult =
  | Readonly<{ success: true; value: AnalyticsDetailsSelection }>
  | Readonly<{
      success: false;
      reason: "invalid_period" | "invalid_scope" | "invalid_member";
    }>;

type DetailsSearchInput = Readonly<{
  start?: unknown;
  end?: unknown;
  scope?: unknown;
  member?: unknown;
}>;

const scopes: readonly AnalyticsScope[] = ["group", "self", "member"];
const uuidSchema = z.uuid();

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

// 終了月を含む指定月数の開始月を返す
export function analyticsPresetStart(
  endMonth: string,
  monthCount: number,
): string {
  let current = endMonth;
  for (let index = 1; index < monthCount; index += 1) {
    current = shiftAnalyticsMonth(current, -1);
  }
  return current;
}

// 詳細分析の期間・対象を検証し、未指定時は当月までの直近6か月へ正規化する
export function parseAnalyticsDetailsSelection(
  input: DetailsSearchInput,
  currentMonth: string,
): AnalyticsDetailsSelectionResult {
  const startValue = optionalString(input.start);
  const endValue = optionalString(input.end);
  if (startValue === null || endValue === null) {
    return { success: false, reason: "invalid_period" };
  }
  const endMonth = endValue ?? currentMonth;
  if (!isAnalyticsMonth(endMonth)) {
    return { success: false, reason: "invalid_period" };
  }
  const startMonth = startValue ?? analyticsPresetStart(endMonth, 6);
  if (!listAnalyticsMonths(startMonth, endMonth)) {
    return { success: false, reason: "invalid_period" };
  }

  const scopeValue = optionalString(input.scope);
  if (scopeValue === null) return { success: false, reason: "invalid_scope" };
  const scope = (scopeValue ?? "group") as AnalyticsScope;
  if (!scopes.includes(scope)) {
    return { success: false, reason: "invalid_scope" };
  }

  const memberValue = optionalString(input.member);
  if (memberValue === null) return { success: false, reason: "invalid_member" };
  const member = memberValue === "" ? undefined : memberValue;
  if (scope === "member") {
    if (!member || !uuidSchema.safeParse(member).success) {
      return { success: false, reason: "invalid_member" };
    }
  } else if (member !== undefined) {
    return { success: false, reason: "invalid_member" };
  }

  return {
    success: true,
    value: {
      startMonth,
      endMonth,
      scope,
      ...(scope === "member" && member ? { memberId: member } : {}),
    },
  };
}
