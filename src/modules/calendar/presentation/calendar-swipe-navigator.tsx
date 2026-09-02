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

type SwipeStart = Readonly<{
  pointerId: number;
  x: number;
  y: number;
  width: number;
}>;

const SWIPE_FEEDBACK_LIMIT_RATIO = 0.35;
// タップの微小なぶれではpointerを捕捉せず、明確な水平移動だけを捕捉対象にする
const SWIPE_CAPTURE_THRESHOLD_PX = 8;

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
  const contentRef = useRef<HTMLDivElement>(null);
  // 月移動が成立した直後に同じpointerから届くclickを1回だけ無視する (AC-CAL-015-3)
  const suppressNextClick = useRef(false);

  // pointer移動量をカレンダー幅内へ制限し、表示だけを指へ追従させる (AC-CAL-015-6)
  function updateSwipeFeedback(
    area: HTMLDivElement,
    deltaX: number,
    width: number,
  ) {
    const limit = width * SWIPE_FEEDBACK_LIMIT_RATIO;
    const offset = Math.max(-limit, Math.min(limit, deltaX));
    contentRef.current?.style.setProperty("--calendar-swipe-x", `${offset}px`);
    area.dataset.swipeState = "dragging";
    area.dataset.swipeDirection = deltaX < 0 ? "next" : "previous";
  }

  function resetSwipeFeedback(area: HTMLDivElement) {
    contentRef.current?.style.setProperty("--calendar-swipe-x", "0px");
    delete area.dataset.swipeDirection;
    delete area.dataset.swipeState;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: event.currentTarget.getBoundingClientRect().width,
    };
    event.currentTarget.dataset.swipeState = "dragging";
  }

  // 水平dragが始まった後だけpointerを捕捉し、領域外で放してもfeedbackを戻せるようにする。
  // pointerdown時点で捕捉するとclickの発火先がこの領域へ変わり、日付リンクのタップが選択にならない (AC-CAL-015-3)
  function capturePointer(area: HTMLDivElement, pointerId: number) {
    if (area.hasPointerCapture?.(pointerId)) return;
    area.setPointerCapture?.(pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) <= Math.abs(deltaY) || deltaX === 0) {
      resetSwipeFeedback(event.currentTarget);
      return;
    }

    if (Math.abs(deltaX) >= SWIPE_CAPTURE_THRESHOLD_PX) {
      capturePointer(event.currentTarget, event.pointerId);
    }
    updateSwipeFeedback(event.currentTarget, deltaX, start.width);
  }

  // ブラウザが縦スクロール等でpointerを引き取った場合は判定を破棄する (AC-CAL-015-2)
  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    swipeStart.current = undefined;
    resetSwipeFeedback(event.currentTarget);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = undefined;
    if (!start || start.pointerId !== event.pointerId) {
      resetSwipeFeedback(event.currentTarget);
      return;
    }

    const width = start.width;
    const offset = resolveSwipeMonthOffset({
      deltaX: event.clientX - start.x,
      deltaY: event.clientY - start.y,
      width,
    });
    if (!offset) {
      resetSwipeFeedback(event.currentTarget);
      return;
    }

    // clickはpointerupと同じtask内で届くため、次のtickで抑止を解除して以降のタップを妨げない
    suppressNextClick.current = true;
    window.setTimeout(() => {
      suppressNextClick.current = false;
    }, 0);
    event.currentTarget.dataset.swipeState = "departing";
    event.currentTarget.dataset.swipeDirection =
      offset === 1 ? "next" : "previous";
    contentRef.current?.style.setProperty(
      "--calendar-swipe-x",
      `${offset === 1 ? -width : width}px`,
    );
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
      data-swipe-area="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={handleClickCapture}
      onDragStart={handleDragStart}
    >
      <span
        className={`${styles["calendar-swipe-indicator"]} ${styles["is-previous"]}`}
        aria-hidden="true"
      >
        ‹ 前月
      </span>
      <span
        className={`${styles["calendar-swipe-indicator"]} ${styles["is-next"]}`}
        aria-hidden="true"
      >
        翌月 ›
      </span>
      <div
        ref={contentRef}
        className={styles["calendar-swipe-content"]}
        data-swipe-content="true"
        style={{ "--calendar-swipe-x": "0px" } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
