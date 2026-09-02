"use client";

import type { ReactNode, Ref } from "react";

import {
  AMOUNT_KEYPAD_KEYS,
  type AmountKeypadKey,
} from "../domain/amount-keypad";

import styles from "./transactions.module.css";

type AmountKeypadProps = Readonly<{
  /** 数字キーと1文字削除を表示するか。閉じている間は`side`だけを描画する */
  open: boolean;
  onKey: (key: AmountKeypadKey) => void;
  onDelete: () => void;
  /** 1文字削除の下（右列）へ常設する操作。取引入力では保存ボタン (AC-TXN-016-1) */
  side?: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}>;

// 取引入力と定期取引で共有する金額テンキー。数字・00・1文字削除を備え、各キーはフォームを送信しない (TXN-014, REC-010)
export function AmountKeypad({
  open,
  onKey,
  onDelete,
  side,
  className,
  ref,
}: AmountKeypadProps) {
  return (
    <div
      className={[styles.keypad, className].filter(Boolean).join(" ")}
      ref={ref}
    >
      {open && (
        <div className={styles["keypad-digits"]}>
          {AMOUNT_KEYPAD_KEYS.map((key) => (
            <button
              className={styles["keypad-key"]}
              data-key={key}
              key={key}
              onClick={() => onKey(key)}
              type="button"
            >
              {key}
            </button>
          ))}
        </div>
      )}
      <div className={styles["keypad-side"]}>
        {open && (
          <button
            aria-label="1桁削除"
            className={styles["keypad-key"]}
            onClick={onDelete}
            type="button"
          >
            <span aria-hidden="true">⌫</span>
          </button>
        )}
        {side}
      </div>
    </div>
  );
}
