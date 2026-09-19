"use client";

import { useEffect, useState } from "react";

import { ChoiceChip, ChoiceChipList } from "@/modules/ui";

import {
  type ExplicitTheme,
  parseThemePreference,
  type ThemePreference,
} from "../domain/theme-preference";
import { applyThemePreference } from "./apply-theme-preference";

import styles from "./theme.module.css";

type ThemePreferenceChipsProps = Readonly<{
  /** サーバーがcookieから読んだ現在の選択。systemは未選択（OS設定に従う） */
  initialPreference: ThemePreference;
}>;

const OPTIONS: readonly { value: ExplicitTheme; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

// 設定画面の「画面の配色」項目。ライト・ダークの2択で、選ぶと同じ画面が即時に切り替わりブラウザだけのcookieに保存する (NFR-UI-010, 03 §9)
export function ThemePreferenceChips({
  initialPreference,
}: ThemePreferenceChipsProps) {
  const [selected, setSelected] = useState<ExplicitTheme | null>(
    initialPreference === "system" ? null : initialPreference,
  );
  // 利用者が選んだかどうか。未選択の間だけOSの配色をchipへ映す
  const [chosen, setChosen] = useState(initialPreference !== "system");

  // 未選択ではサーバーがOS設定を知らないため、hydration後にmatchMediaで現在有効な側を選択状態にする
  useEffect(() => {
    if (chosen) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const reflect = (matches: boolean) =>
      setSelected(matches ? "dark" : "light");
    reflect(media.matches);
    const onChange = (event: { matches: boolean }) => reflect(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [chosen]);

  function handleChange(value: string): void {
    // radioの値も外部入力として扱い、許可値以外は無視する
    const next = parseThemePreference(value);
    if (next === "system") return;
    setChosen(true);
    setSelected(next);
    applyThemePreference(next);
  }

  return (
    <fieldset className={styles["theme-preference"]}>
      <legend className={styles["theme-preference-title"]}>画面の配色</legend>
      <ChoiceChipList>
        {OPTIONS.map((option) => (
          <ChoiceChip
            checked={selected === option.value}
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
    </fieldset>
  );
}
