import type { ExpenseAllocation } from "../domain/expense-allocation";
import type { ExpenseFormOptions } from "./expense-types";

export type ExpenseEditTransaction = Readonly<{
  id: string;
  amountMinor: number;
  transactionDate: string;
  categoryId: string;
  /** 現在のカテゴリがアーカイブ済みの場合だけ、選択肢へ追加表示するための情報 */
  archivedCategory?: Readonly<{ id: string; name: string; color: string }>;
  payerMemberId: string;
  payerIsActive: boolean;
  payerDisplayName: string;
  memo: string | null;
  version: number;
  allocationMethod: "single" | "equal" | "custom";
  allocations: readonly ExpenseAllocation[];
}>;

export type ExpenseEditData = Readonly<{
  options: ExpenseFormOptions;
  transaction: ExpenseEditTransaction;
}>;

export type RecoverableTransaction = Readonly<{
  id: string;
  amountMinor: number;
  transactionDate: string;
  categoryName: string;
  categoryColor: string;
  payerDisplayName: string;
  deletedAt: string;
  restoreDeadline: string;
  version: number;
}>;

export type TransactionCommandResult =
  | Readonly<{ kind: "ok" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "error" }>;
