import type { ExpenseAllocation } from "../domain/expense-allocation";
import type { ExpenseFormOptions } from "./expense-types";

export type ExpenseEditTransaction = Readonly<{
  type: "expense";
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

export type IncomeEditTransaction = Readonly<{
  type: "income";
  id: string;
  amountMinor: number;
  transactionDate: string;
  categoryId: string;
  archivedCategory?: Readonly<{ id: string; name: string; color: string }>;
  recipientMemberId: string;
  recipientIsActive: boolean;
  recipientDisplayName: string;
  memo: string | null;
  version: number;
}>;

// 編集対象は種別つきのunionとし、フォームは種別に応じた項目だけを表示する
export type TransactionEditTransaction =
  ExpenseEditTransaction | IncomeEditTransaction;

export type ExpenseEditData = Readonly<{
  options: ExpenseFormOptions;
  transaction: TransactionEditTransaction;
}>;

export type TransactionCommandResult =
  | Readonly<{ kind: "ok" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "error" }>;
