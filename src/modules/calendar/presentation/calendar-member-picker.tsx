"use client";

import Link from "next/link";
import { useRef } from "react";

import styles from "./calendar.module.css";

export type CalendarMemberOption = Readonly<{
  membershipId: string;
  label: string;
  href: string;
  isSelected: boolean;
}>;

type CalendarMemberPickerProps = Readonly<{
  summaryLabel: string;
  isActive: boolean;
  options: readonly CalendarMemberOption[];
}>;

// 集計対象のメンバーを選ぶdropdown。選択したら閉じる（開いたままだと一覧がカレンダーを覆う）(R-062)
// 枠には名前と印を並べ、省略するのは名前だけにして全文をtitleへ残す (AC-CAL-004-3)
export function CalendarMemberPicker({
  summaryLabel,
  isActive,
  options,
}: CalendarMemberPickerProps) {
  const pickerRef = useRef<HTMLDetailsElement>(null);

  // 同じメンバーを選び直して画面遷移が起きない場合も確実に閉じる
  function closePicker() {
    const picker = pickerRef.current;
    if (picker) picker.open = false;
  }

  return (
    <details className={styles["calendar-member-picker"]} ref={pickerRef}>
      <summary
        className={isActive ? "is-active" : undefined}
        aria-current={isActive ? "page" : undefined}
        title={summaryLabel}
      >
        <span className={styles["calendar-member-picker-label"]}>
          {summaryLabel}
        </span>
        <span
          className={styles["calendar-member-picker-marker"]}
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>
      <div className={styles["calendar-member-options"]}>
        {options.map((option) => (
          <Link
            key={option.membershipId}
            className={option.isSelected ? styles["is-selected"] : undefined}
            href={option.href}
            aria-current={option.isSelected ? "page" : undefined}
            onClick={closePicker}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
