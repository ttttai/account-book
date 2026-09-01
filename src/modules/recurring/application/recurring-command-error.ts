import "server-only";

import { formatCommandFailureLog } from "../domain/recurring-command-log";
import type { RecurringCommandResult } from "./recurring-types";

// DB関数が返すSQLSTATEを、画面が区別して扱う結果種別へ変換する
// 40001: version競合、P0002: 対象なし、42501: 権限不足、28000: 未認証、22023: 入力不正
export function mapRecurringCommandError(
  code: unknown,
): Exclude<RecurringCommandResult, Readonly<{ kind: "ok" }>> {
  if (code === "40001") return { kind: "conflict" };
  if (code === "P0002") return { kind: "not_found" };
  if (code === "42501" || code === "28000") return { kind: "forbidden" };
  if (code === "22023") return { kind: "invalid" };
  return { kind: "error" };
}

// DB commandの失敗を、原因を切り分けられる最小情報だけでサーバーlogへ残す（NFR-OPS-008）
export function logRecurringCommandFailure(
  operation: string,
  code: unknown,
): void {
  console.error(formatCommandFailureLog({ operation, code }));
}
