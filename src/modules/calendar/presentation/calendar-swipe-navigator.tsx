"use client";

import { useRouter } from "next/navigation";
import {
  useRef,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { resolveSwipeMonthOffset } from "../domain/calendar-swipe";

import styles from "./calendar.module.css";

type SwipeStart = Readonly<{ pointerId: number; x: number; y: number }>;

// カレンダー本体の横スワイプで前月・翌月へ遷移する判定領域。日付選択の局所更新には関与しない (CAL-015)
export function CalendarSwipeNavigator({
  previousMonthHref,
  nextMonthHref,
  children,
}: Readonly<{
  previousMonthHref: string;
  nextMonthHref: string;
  children: ReactNode;
}>) {
  const router = useRouter();
  const swipeStart = useRef<SwipeStart | undefined>(undefined);
  // 月移動が成立した直後に同じpointerから届くclickを1回だけ無視する (AC-CAL-015-3)
  const suppressNextClick = useRef(false);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  // ブラウザが縦スクロール等でpointerを引き取った場合は判定を破棄する (AC-CAL-015-2)
  function handlePointerCancel() {
    swipeStart.current = undefined;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = undefined;
    if (!start || start.pointerId !== event.pointerId) return;

    const offset = resolveSwipeMonthOffset({
      deltaX: event.clientX - start.x,
      deltaY: event.clientY - start.y,
      width: event.currentTarget.getBoundingClientRect().width,
    });
    if (!offset) return;

    // clickはpointerupと同じtask内で届くため、次のtickで抑止を解除して以降のタップを妨げない
    suppressNextClick.current = true;
    window.setTimeout(() => {
      suppressNextClick.current = false;
    }, 0);
    // 遷移先は前月・翌月ボタンと同じURL（scope・member維持、day解除）(AC-CAL-015-1)
    router.push(offset === 1 ? nextMonthHref : previousMonthHref);
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressNextClick.current) return;
    suppressNextClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // 日付セルはリンクなので、マウスのドラッグがHTMLのネイティブdrag（pointercancelを発生させる）へ奪われないようにする
  function handleDragStart(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 領域はジェスチャー判定だけを担い、操作対象は内側の日付リンクと前月・翌月ボタン（キーボード到達可）にある
    <div
      className={styles["calendar-swipe-area"]}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={handleClickCapture}
      onDragStart={handleDragStart}
    >
      {children}
    </div>
  );
}
