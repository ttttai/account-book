"use client";

import Link from "next/link";
import { useRef } from "react";

import styles from "./analytics.module.css";

export type AnalyticsMemberOption = Readonly<{
  membershipId: string;
  label: string;
  href: string;
  isSelected: boolean;
}>;

type AnalyticsMemberPickerProps = Readonly<{
  summaryLabel: string;
  isActive: boolean;
  options: readonly AnalyticsMemberOption[];
}>;

// 自分以外のメンバーから集計対象を選ぶdropdown。選んだら閉じて候補一覧が指標を覆わないようにする (AC-ANA-005-4)
// 枠には名前と印を並べ、省略するのは名前だけにして全文をtitleへ残す (AC-CAL-004-3)
export function AnalyticsMemberPicker({
  summaryLabel,
  isActive,
  options,
}: AnalyticsMemberPickerProps) {
  const pickerRef = useRef<HTMLDetailsElement>(null);

  // 同じメンバーを選び直して画面遷移が起きない場合も確実に閉じる
  function closePicker() {
    const picker = pickerRef.current;
    if (picker) picker.open = false;
  }

  return (
    <details className={styles["analytics-member-picker"]} ref={pickerRef}>
      <summary
        className={isActive ? "is-active" : undefined}
        title={summaryLabel}
      >
        <span className={styles["analytics-member-picker-label"]}>
          {summaryLabel}
        </span>
        <span
          className={styles["analytics-member-picker-marker"]}
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>
      <div className={styles["analytics-member-options"]}>
        {options.map((option) => (
          <Link
            aria-current={option.isSelected ? "page" : undefined}
            className={option.isSelected ? styles["is-selected"] : undefined}
            href={option.href}
            key={option.membershipId}
            onClick={closePicker}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
