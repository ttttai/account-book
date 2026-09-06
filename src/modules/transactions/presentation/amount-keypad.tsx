"use client";

import { Fragment, type ReactNode, type Ref } from "react";

import {
  AMOUNT_KEYPAD_KEYS,
  AMOUNT_OPERATORS,
  type AmountKeypadKey,
  type AmountOperator,
} from "../domain/amount-keypad";

import styles from "./transactions.module.css";

/** 電卓の演算子キーと=を有効にするための操作。指定しないフォームは数字だけのテンキーになる (TXN-017) */
export type AmountKeypadCalculator = Readonly<{
  onOperator: (operator: AmountOperator) => void;
  onEquals: () => void;
}>;

type AmountKeypadProps = Readonly<{
  /** 数字キーと1文字削除を表示するか。閉じている間は`side`だけを描画する */
  open: boolean;
  onKey: (key: AmountKeypadKey) => void;
  onDelete: () => void;
  calculator?: AmountKeypadCalculator;
  /** 1文字削除の下（右列）へ常設する操作。取引入力では保存ボタン (AC-TXN-016-1) */
  side?: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}>;

// 数字キーを行ごとに分け、電卓有効時は各行の右端へ演算子を並べる
const DIGIT_ROWS: readonly (readonly AmountKeypadKey[])[] = [
  AMOUNT_KEYPAD_KEYS.slice(0, 3),
  AMOUNT_KEYPAD_KEYS.slice(3, 6),
  AMOUNT_KEYPAD_KEYS.slice(6, 9),
  AMOUNT_KEYPAD_KEYS.slice(9, 11),
];

const OPERATOR_LABELS: Readonly<Record<AmountOperator, string>> = {
  "÷": "割る",
  "×": "掛ける",
  "−": "引く",
  "+": "足す",
};

// 取引入力と固定費で共有する金額テンキー。数字・00・1文字削除に加え、任意で四則演算と=を備える。各キーはフォームを送信しない (TXN-014, REC-010, TXN-017)
export function AmountKeypad({
  open,
  onKey,
  onDelete,
  calculator,
  side,
  className,
  ref,
}: AmountKeypadProps) {
  const calculatorOpen = open && calculator !== undefined;
  return (
    <div
      className={[styles.keypad, className].filter(Boolean).join(" ")}
      data-calculator={calculatorOpen ? "true" : undefined}
      ref={ref}
    >
      {open && (
        <div className={styles["keypad-digits"]}>
          {DIGIT_ROWS.map((row, rowIndex) => {
            const operator = calculator ? AMOUNT_OPERATORS[rowIndex] : null;
            return (
              <Fragment key={row.join("-")}>
                {row.map((key) => (
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
                {operator && (
                  <button
                    aria-label={OPERATOR_LABELS[operator]}
                    className={styles["keypad-key"]}
                    data-key={operator}
                    data-operator=""
                    onClick={() => calculator?.onOperator(operator)}
                    type="button"
                  >
                    <span aria-hidden="true">{operator}</span>
                  </button>
                )}
              </Fragment>
            );
          })}
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
        {calculatorOpen && (
          <button
            aria-label="計算する"
            className={styles["keypad-key"]}
            data-key="="
            data-operator=""
            onClick={calculator?.onEquals}
            type="button"
          >
            <span aria-hidden="true">=</span>
          </button>
        )}
        {side}
      </div>
    </div>
  );
}
