import "server-only";

import { formatBudgetCommandFailureLog } from "../domain/budget-command-log";
import type { BudgetCommandResult } from "./budget-types";

// DB関数が返すSQLSTATEを、画面が区別して扱う結果種別へ変換する
// 40001: version競合、23505: 同月の同時作成（競合として扱う）、P0002: 対象なし、42501/28000: 権限不足・未認証、22023: 入力不正
export function mapBudgetCommandError(
  code: unknown,
): Exclude<BudgetCommandResult, Readonly<{ kind: "ok" }>> {
  if (code === "40001" || code === "23505") return { kind: "conflict" };
  if (code === "P0002") return { kind: "not_found" };
  if (code === "42501" || code === "28000") return { kind: "forbidden" };
  if (code === "22023") return { kind: "invalid" };
  return { kind: "error" };
}

// DB commandの失敗を、原因を切り分けられる最小情報だけでサーバーlogへ残す（NFR-OPS-008）
export function logBudgetCommandFailure(
  operation: string,
  code: unknown,
): void {
  console.error(formatBudgetCommandFailureLog({ operation, code }));
}
