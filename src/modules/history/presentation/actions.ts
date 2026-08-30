"use server";

import { getGroupHistoryPage } from "../application/get-group-history";
import type { HistoryRow } from "../domain/history-row";

export type HistoryLoadMoreResult =
  | Readonly<{
      status: "ready";
      rows: readonly HistoryRow[];
      nextCursor?: string;
    }>
  | Readonly<{ status: "error"; message: string }>;

const loadMoreErrorMessage =
  "履歴の続きを取得できませんでした。接続状態を確認して、もう一度お試しください。";

// 薄い認証・検証境界。値の検証と認可はapplication層で毎回行う
export async function loadMoreHistoryAction(
  groupId: string,
  search: Readonly<Record<string, string>>,
): Promise<HistoryLoadMoreResult> {
  try {
    const page = await getGroupHistoryPage(groupId, search);
    if (page?.kind !== "page") {
      return { status: "error", message: loadMoreErrorMessage };
    }
    return {
      status: "ready",
      rows: page.rows,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  } catch {
    return { status: "error", message: loadMoreErrorMessage };
  }
}
