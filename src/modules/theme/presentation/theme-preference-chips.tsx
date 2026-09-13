"use client";

import { useState } from "react";

import { ChoiceChip, ChoiceChipList } from "@/modules/ui";

import {
  parseThemePreference,
  type ThemePreference,
} from "../domain/theme-preference";
import { applyThemePreference } from "./apply-theme-preference";

import styles from "./theme.module.css";

type ThemePreferenceChipsProps = Readonly<{
  /** サーバーがcookieから読んだ現在の選択 */
  initialPreference: ThemePreference;
}>;

const OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "OSに従う" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

// 設定画面の「画面の配色」項目。選ぶと同じ画面が即時に切り替わり、ブラウザだけのcookieに保存する (NFR-UI-010, 03 §9)
export function ThemePreferenceChips({
  initialPreference,
}: ThemePreferenceChipsProps) {
  const [preference, setPreference] = useState(initialPreference);

  function handleChange(value: string): void {
    // radioの値も外部入力として扱い、許可値以外はOSに従うへ倒す
    const next = value === "system" ? "system" : parseThemePreference(value);
    setPreference(next);
    applyThemePreference(next);
  }

  return (
    <fieldset
      aria-describedby="theme-preference-note"
      className={styles["theme-preference"]}
    >
      <legend className={styles["theme-preference-title"]}>画面の配色</legend>
      <ChoiceChipList>
        {OPTIONS.map((option) => (
          <ChoiceChip
            checked={preference === option.value}
            key={option.value}
            name="themePreference"
            onChange={(event) => handleChange(event.target.value)}
            type="radio"
            value={option.value}
          >
            {option.label}
          </ChoiceChip>
        ))}
      </ChoiceChipList>
      <small
        className={styles["theme-preference-note"]}
        id="theme-preference-note"
      >
        「OSに従う」は端末の設定どおりに切り替わります。このブラウザだけの設定で、他のメンバーや他の端末には影響しません。
      </small>
    </fieldset>
  );
}
