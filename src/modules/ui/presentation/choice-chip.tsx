import type { ChangeEvent, ReactNode } from "react";

import styles from "./ui.module.css";

type ChoiceChipProps = Readonly<{
  type: "radio" | "checkbox";
  name: string;
  value: string;
  children: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  disabled?: boolean;
}>;

// 名称・選択記号・枠・背景を持つchip型の選択肢。radio/checkboxのsemanticsは視覚的に隠したinputで維持する (AC-GRP-001-6, AC-TXN-001-11)
export function ChoiceChip({
  type,
  name,
  value,
  children,
  checked,
  defaultChecked,
  onChange,
  required,
  disabled,
}: ChoiceChipProps) {
  return (
    <label className={styles["choice-chip"]}>
      <input
        checked={checked}
        className={styles["choice-chip-input"]}
        defaultChecked={defaultChecked}
        disabled={disabled}
        name={name}
        onChange={onChange}
        required={required}
        type={type}
        value={value}
      />
      <span className={styles["choice-chip-content"]}>
        <span className={styles["choice-chip-label"]}>{children}</span>
        <span aria-hidden="true" className={styles["choice-chip-mark"]}>
          ✓
        </span>
      </span>
    </label>
  );
}

// chipを横に並べ、幅に収まらない分は折り返す一覧。320pxでも横scrollを出さない
export function ChoiceChipList({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className={styles["choice-chip-list"]}>{children}</div>;
}
