"use client";

import { type ReactNode, useState } from "react";

import styles from "./analytics.module.css";

type AnalyticsDetailsFoldProps = Readonly<{
  /** 開閉ボタンと内容を結ぶid。ページ内で一意にする */
  id: string;
  heading: string;
  defaultOpen: boolean;
  /** PCの2カラムで全幅を使うか */
  wide?: boolean;
  children: ReactNode;
}>;

// 参照頻度の低い領域を見出しの開閉ボタンで折りたたむ。状態はローカルだけで、900px以上ではCSSが常に展開する (AC-ANA-017-2, AC-ANA-017-3)
export function AnalyticsDetailsFold({
  id,
  heading,
  defaultOpen,
  wide = false,
  children,
}: AnalyticsDetailsFoldProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bodyId = `${id}-body`;

  return (
    <section
      className={`${styles["details-panel"]} ${styles["details-fold"]}${wide ? ` ${styles["details-wide"]}` : ""}`}
      data-details-fold={id}
    >
      <h3 className={styles["details-fold-heading"]}>
        <button
          aria-controls={bodyId}
          aria-expanded={isOpen}
          className={styles["details-fold-toggle"]}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          {heading}
        </button>
        {/* 900px以上では開閉ボタンを隠し、この見出し文字だけを表示する */}
        <span className={styles["details-fold-title"]}>{heading}</span>
      </h3>
      <div className={styles["details-fold-body"]} hidden={!isOpen} id={bodyId}>
        {children}
      </div>
    </section>
  );
}
