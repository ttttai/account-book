"use server";

import type { AnalyticsDetailsReady } from "../application/analytics-types";
import { getAnalyticsDetails } from "../application/get-analytics-details";

export type AnalyticsDetailsFilterResult =
  | Readonly<{ status: "ready"; data: AnalyticsDetailsReady }>
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "error"; message: string }>;

const applyFilterErrorMessage =
  "表示条件を反映できませんでした。接続状態を確認して、もう一度お試しください。";

// 表示条件を変えたときに詳細分析DTOを取り直す薄い認証・検証境界。認可と条件検証は毎回application層で行う (AC-ANA-016-1)
export async function applyAnalyticsDetailsFilterAction(
  groupId: string,
  search: Readonly<Record<string, string>>,
): Promise<AnalyticsDetailsFilterResult> {
  try {
    const details = await getAnalyticsDetails(groupId, search);
    // 所属なし・存在しないグループは失敗へ丸め、別グループの存在を明かさない
    if (!details) return { status: "error", message: applyFilterErrorMessage };
    if (details.kind === "invalid") return { status: "invalid" };
    return { status: "ready", data: details };
  } catch {
    return { status: "error", message: applyFilterErrorMessage };
  }
}
