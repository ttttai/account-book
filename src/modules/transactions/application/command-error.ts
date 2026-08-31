import "server-only";

import { formatCommandFailureLog } from "../domain/command-failure-log";
import type { TransactionCommandResult } from "./edit-types";

// DB関数が返すSQLSTATEを、画面が区別して扱う結果種別へ変換する
export function mapTransactionCommandError(
  code: unknown,
): Exclude<TransactionCommandResult, Readonly<{ kind: "ok" }>> {
  // 40001: version競合、P0002: 対象なし（削除済み含む）、22023: 入力不正
  if (code === "40001") return { kind: "conflict" };
  if (code === "P0002") return { kind: "not_found" };
  if (code === "22023") return { kind: "invalid" };
  return { kind: "error" };
}

// DB commandの失敗を、原因を切り分けられる最小情報だけでサーバーlogへ残す（NFR-OPS-008）
export function logTransactionCommandFailure(
  operation: string,
  code: unknown,
): void {
  console.error(formatCommandFailureLog({ operation, code }));
}
