"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  const confirmRef = useRef<HTMLDivElement>(null);

  // 確認dialogは開いた場所で縦に伸びるため、固定ドックへ隠れないよう重なりぶんだけ移動する (AC-TXN-009-5)
  // ドックが画面下端へ重なるのは狭い画面だけなので、PC幅では動かさない
  useEffect(() => {
    if (!isConfirming) return;
    if (window.matchMedia?.("(min-width: 900px)").matches) return;
    const dialog = confirmRef.current;
    if (!dialog) return;
    // 外枠が反映したドックの全高（CSS変数）から、ドック上端＝隠れない下端を求める
    const dockHeight = Number.parseFloat(
      window
        .getComputedStyle(dialog)
        .getPropertyValue("--input-dock-total-height"),
    );
    const visibleBottom = window.innerHeight - (dockHeight || 0);
    const overlap = dialog.getBoundingClientRect().bottom - visibleBottom + 8;
    if (overlap > 0) window.scrollBy({ top: overlap });
  }, [isConfirming]);

  return (
    <section
      aria-label="取引の削除"
      className={styles["delete-transaction-section"]}
    >
      {isConfirming ? (
        <div
          className={styles["delete-transaction-confirm"]}
          ref={confirmRef}
          role="alertdialog"
          aria-labelledby="delete-transaction-confirm-title"
        >
          <p id="delete-transaction-confirm-title">
            {summary}
            の取引を削除します。削除した取引は元に戻せません。
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
