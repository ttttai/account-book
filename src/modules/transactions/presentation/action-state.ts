import type { TransactionSaveFeedback } from "../domain/save-feedback";

/** 成功時にフォームへ返す、検証済みの遷移先と保存結果の通知内容 (TXN-019) */
export type TransactionSaveSuccess = Readonly<{
  redirectTo: string;
  feedback: TransactionSaveFeedback;
}>;

export type ExpenseActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Readonly<Record<string, readonly string[] | undefined>>;
  /** `status: "success"`のときだけ持つ。フォームが通知を表示してから遷移する */
  success?: TransactionSaveSuccess;
}>;

export const INITIAL_EXPENSE_ACTION_STATE: ExpenseActionState = {
  status: "idle",
};
