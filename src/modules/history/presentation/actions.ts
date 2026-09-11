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
const applyFilterErrorMessage =
  "絞り込みを反映できませんでした。接続状態を確認して、もう一度お試しください。";

// 値の検証と認可はapplication層で毎回行い、不正・失敗は取引データを含まないエラーへ丸める
async function loadHistoryPage(
  groupId: string,
  search: Readonly<Record<string, string>>,
  errorMessage: string,
): Promise<HistoryLoadMoreResult> {
  try {
    const page = await getGroupHistoryPage(groupId, search);
    if (page?.kind !== "page") {
      return { status: "error", message: errorMessage };
    }
    return {
      status: "ready",
      rows: page.rows,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  } catch {
    return { status: "error", message: errorMessage };
  }
}

// 「さらに読み込む」用の薄い認証・検証境界
export async function loadMoreHistoryAction(
  groupId: string,
  search: Readonly<Record<string, string>>,
): Promise<HistoryLoadMoreResult> {
  return loadHistoryPage(groupId, search, loadMoreErrorMessage);
}

// chip・sheetで条件を変えたときに1ページ目を取り直す薄い認証・検証境界 (AC-HIS-008-1)
export async function applyHistoryFilterAction(
  groupId: string,
  search: Readonly<Record<string, string>>,
): Promise<HistoryLoadMoreResult> {
  return loadHistoryPage(groupId, search, applyFilterErrorMessage);
}
