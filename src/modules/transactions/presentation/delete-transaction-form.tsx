"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { INITIAL_EXPENSE_ACTION_STATE } from "./action-state";
import { deleteTransactionAction } from "./actions";

import styles from "./transactions.module.css";

type DeleteTransactionFormProps = Readonly<{
  groupId: string;
  transactionId: string;
  expectedVersion: number;
  returnTo: string;
  /** 確認dialogへ表示する対象の説明（例: 「2026年8月11日・￥8,000」） */
  summary: string;
}>;

// 送信中は無効化する削除確定ボタン
function ConfirmDeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className={`primary-button ${styles["danger-button"]}`}
      disabled={pending}
      type="submit"
    >
      {pending ? "削除中…" : "削除を確定する"}
    </button>
  );
}

// 取引削除の2段階確認フォーム。元に戻せないことを明示してから物理削除を実行するClient Component
export function DeleteTransactionForm({
  groupId,
  transactionId,
  expectedVersion,
  returnTo,
  summary,
}: DeleteTransactionFormProps) {
  const boundAction = deleteTransactionAction.bind(
    null,
    groupId,
    transactionId,
    returnTo,
  );
  const [state, action] = useActionState(
    boundAction,
    INITIAL_EXPENSE_ACTION_STATE,
  );
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <section
      aria-label="取引の削除"
      className={styles["delete-transaction-section"]}
    >
      {isConfirming ? (
        <div
          className={styles["delete-transaction-confirm"]}
          role="alertdialog"
          aria-labelledby="delete-transaction-confirm-title"
        >
          <p id="delete-transaction-confirm-title">
            {summary}
            の支出を削除します。削除した取引は元に戻せません。
          </p>
          <form action={action}>
            <input
              name="expectedVersion"
              type="hidden"
              value={expectedVersion}
            />
            <div className={styles["delete-transaction-actions"]}>
              <ConfirmDeleteButton />
              <button
                className="secondary-button"
                onClick={() => setIsConfirming(false)}
                type="button"
              >
                やめる
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          className={`secondary-button ${styles["delete-transaction-open"]}`}
          onClick={() => setIsConfirming(true)}
          type="button"
        >
          この取引を削除する
        </button>
      )}
      {state.message && (
        <p className="form-message error" role="alert">
          {state.message}
        </p>
      )}
    </section>
  );
}
