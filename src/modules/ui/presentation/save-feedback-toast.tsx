"use client";

import { usePathname } from "next/navigation";
import { type MouseEvent, useEffect } from "react";
import { Toaster, toast } from "sonner";

import {
  buildSaveFeedbackCookieDeletion,
  decodeSaveFeedbackCookie,
  readSaveFeedbackCookie,
  type SaveFeedback,
} from "../domain/save-feedback-cookie";

import styles from "./ui.module.css";

// 上端はsafe areaの下に置く (AC-TXN-019-4)
const TOP_OFFSET = "max(0.75rem, env(safe-area-inset-top))";
const SIDE_OFFSET = 16;

// 保存結果の通知を表示する。表示中の通知を消してから出すため、常に最新の1件だけが残る (AC-TXN-019-4)
export function showSaveFeedback(feedback: SaveFeedback): void {
  toast.dismiss();
  toast.success(feedback.title, { description: feedback.description });
}

// 通知本体のタップで即時に消す。通知の外側のタップでは何もしない (AC-TXN-019-4)
function dismissOnToastTap(event: MouseEvent<HTMLDivElement>): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest("[data-sonner-toast]")) return;
  toast.dismiss();
}

// 全画面共通の保存結果の通知領域。ルートレイアウトに1つだけ置き、
// Server Actionがredirect直前に書いたcookieを遷移後に読んで表示し、読んだ直後に削除する (TXN-019, AC-TXN-019-3)
export function SaveFeedbackToaster() {
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: redirect後の遷移（pathnameの変化）ごとにcookieを読み直すための意図的な依存
  useEffect(() => {
    const rawValue = readSaveFeedbackCookie(document.cookie);
    if (rawValue === undefined) return;
    // 壊れた値でも残さない。表示するのは検証を通った内容だけ
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store APIはiOS Safariで使えないため、同期的なdocument.cookieで削除する
    document.cookie = buildSaveFeedbackCookieDeletion();
    const feedback = decodeSaveFeedbackCookie(rawValue);
    if (feedback) showSaveFeedback(feedback);
  }, [pathname]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 本体タップは補助的な消去手段で、キーボードとスクリーンリーダーには「通知を閉じる」ボタンがある
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
    <div className={styles["toast-region"]} onClick={dismissOnToastTap}>
      <Toaster
        closeButton
        customAriaLabel="保存結果の通知"
        duration={4000}
        mobileOffset={{
          top: TOP_OFFSET,
          left: SIDE_OFFSET,
          right: SIDE_OFFSET,
        }}
        offset={{ top: TOP_OFFSET }}
        position="top-center"
        toastOptions={{ closeButtonAriaLabel: "通知を閉じる" }}
        visibleToasts={1}
      />
    </div>
  );
}
