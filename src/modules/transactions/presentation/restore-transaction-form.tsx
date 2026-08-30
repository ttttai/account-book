"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { INITIAL_EXPENSE_ACTION_STATE } from "./action-state";
import { restoreTransactionAction } from "./actions";

import styles from "./transactions.module.css";

type RestoreTransactionFormProps = Readonly<{
  groupId: string;
  transactionId: string;
  expectedVersion: number;
}>;

// 送信中は無効化する復元ボタン
function RestoreButton() {
  const { pending } = useFormStatus();
  return (
    <button className="secondary-button" disabled={pending} type="submit">
      {pending ? "復元中…" : "復元する"}
    </button>
  );
}

// 削除済み取引1件を復元するフォーム。競合・期限切れは行の近くへ表示するClient Component
export function RestoreTransactionForm({
  groupId,
  transactionId,
  expectedVersion,
}: RestoreTransactionFormProps) {
  const boundAction = restoreTransactionAction.bind(null, groupId);
  const [state, action] = useActionState(
    boundAction,
    INITIAL_EXPENSE_ACTION_STATE,
  );

  return (
    <form action={action} className={styles["restore-form"]}>
      <input name="transactionId" type="hidden" value={transactionId} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <RestoreButton />
      {state.message && (
        <p className="form-message error" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
