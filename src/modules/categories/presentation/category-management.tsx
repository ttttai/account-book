"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useFormStatus } from "react-dom";

import type { CategorySummary } from "../application/category-types";
import type { CategoryType } from "../domain/category-input";
import {
  INITIAL_CATEGORY_ACTION_STATE,
  type CategoryActionState,
} from "./action-state";
import {
  addCategoryAction,
  archiveCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
  repositionCategoryAction,
} from "./actions";

import styles from "./categories.module.css";

const typeLabels: Readonly<Record<CategoryType, string>> = {
  expense: "支出カテゴリ",
  income: "収入カテゴリ",
};

function ActionMessage({ state }: { state: CategoryActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`form-message ${state.status === "error" ? "error" : "success"}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function PendingButton({
  className,
  idleLabel,
  pendingLabel,
}: {
  className: string;
  idleLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function AddCategoryForm({
  groupId,
  type,
}: {
  groupId: string;
  type: CategoryType;
}) {
  const action = addCategoryAction.bind(null, groupId, type);
  const [state, formAction] = useActionState(
    action,
    INITIAL_CATEGORY_ACTION_STATE,
  );
  const inputId = useId();

  return (
    <div className="category-add">
      <form action={formAction} className={styles["category-add-form"]}>
        <label htmlFor={inputId}>新しいカテゴリ名</label>
        <div className={styles["category-add-controls"]}>
          <input
            autoComplete="off"
            id={inputId}
            maxLength={30}
            name="name"
            placeholder="例: サブスク"
            required
          />
          <PendingButton
            className={`primary-button ${styles["category-add-button"]}`}
            idleLabel="追加"
            pendingLabel="追加中…"
          />
        </div>
        {state.fieldErrors?.name?.[0] && (
          <p className="field-error">{state.fieldErrors.name[0]}</p>
        )}
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function RenameCategoryForm({
  groupId,
  category,
}: {
  groupId: string;
  category: CategorySummary;
}) {
  const action = renameCategoryAction.bind(null, groupId, category.id);
  const [state, formAction] = useActionState(
    action,
    INITIAL_CATEGORY_ACTION_STATE,
  );
  const inputId = useId();

  return (
    <div className={styles["category-rename"]}>
      <form action={formAction} className={styles["category-rename-form"]}>
        <label className={styles["category-sr-label"]} htmlFor={inputId}>
          {category.name}の新しい名称
        </label>
        <input
          autoComplete="off"
          defaultValue={category.name}
          id={inputId}
          key={category.name}
          maxLength={30}
          name="name"
          required
        />
        <PendingButton
          className={`secondary-button ${styles["category-rename-button"]}`}
          idleLabel="名称を保存"
          pendingLabel="保存中…"
        />
      </form>
      {state.fieldErrors?.name?.[0] && (
        <p className="field-error">{state.fieldErrors.name[0]}</p>
      )}
      <ActionMessage state={state} />
    </div>
  );
}

function MoveCategoryForm({
  groupId,
  category,
  isFirst,
  isLast,
}: {
  groupId: string;
  category: CategorySummary;
  isFirst: boolean;
  isLast: boolean;
}) {
  const action = moveCategoryAction.bind(null, groupId, category.id);
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_CATEGORY_ACTION_STATE,
  );

  return (
    <div className="category-move">
      <form action={formAction} className={styles["category-move-form"]}>
        <button
          aria-label={`${category.name}を上へ移動`}
          className={`secondary-button ${styles["category-move-button"]}`}
          disabled={pending || isFirst}
          name="direction"
          type="submit"
          value="up"
        >
          上へ
        </button>
        <button
          aria-label={`${category.name}を下へ移動`}
          className={`secondary-button ${styles["category-move-button"]}`}
          disabled={pending || isLast}
          name="direction"
          type="submit"
          value="down"
        >
          下へ
        </button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function ArchiveCategoryForm({
  groupId,
  category,
}: {
  groupId: string;
  category: CategorySummary;
}) {
  const action = archiveCategoryAction.bind(null, groupId, category.id);
  const [state, formAction] = useActionState(
    action,
    INITIAL_CATEGORY_ACTION_STATE,
  );

  return (
    <details className={styles["category-archive"]}>
      <summary className={styles["category-archive-summary"]}>
        アーカイブ…
      </summary>
      <p className="field-hint">
        「{category.name}
        」を新規取引の選択肢から外します。過去の取引の表示は変わりません。
      </p>
      <form action={formAction} className={styles["category-archive-form"]}>
        <PendingButton
          className={`secondary-button danger-text ${styles["category-archive-button"]}`}
          idleLabel="アーカイブする"
          pendingLabel="アーカイブ中…"
        />
      </form>
      <ActionMessage state={state} />
    </details>
  );
}

function CategoryRowContent({
  groupId,
  category,
  isFirst,
  isLast,
}: {
  groupId: string;
  category: CategorySummary;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <>
      <div className={styles["category-row-actions"]}>
        <RenameCategoryForm category={category} groupId={groupId} />
        <MoveCategoryForm
          category={category}
          groupId={groupId}
          isFirst={isFirst}
          isLast={isLast}
        />
      </div>
      <ArchiveCategoryForm category={category} groupId={groupId} />
    </>
  );
}

type DragState = Readonly<{
  categoryId: string;
  fromIndex: number;
  startY: number;
  currentY: number;
  targetIndex: number;
}>;

type DragSession = Readonly<{
  categoryId: string;
  fromIndex: number;
  startY: number;
  rects: readonly DOMRect[];
  dispose: () => void;
}>;

// ドラッグ位置から、対象を除いた並びへの挿入位置を求める
function computeDestinationIndex(
  rects: readonly DOMRect[],
  fromIndex: number,
  pointerY: number,
): number {
  let destination = 0;
  for (const [index, rect] of rects.entries()) {
    if (index === fromIndex) continue;
    if (rect.top + rect.height / 2 < pointerY) destination += 1;
  }
  return Math.min(destination, rects.length - 1);
}

function CategoryTypeSection({
  groupId,
  type,
  categories,
}: {
  groupId: string;
  type: CategoryType;
  categories: readonly CategorySummary[];
}) {
  const headingId = `category-section-${type}`;
  const [orderedCategories, setOrderedCategories] = useState(categories);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [reorderState, setReorderState] = useState<CategoryActionState>(
    INITIAL_CATEGORY_ACTION_STATE,
  );
  const [isReordering, setIsReordering] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const dragSessionRef = useRef<DragSession | null>(null);
  const orderedCategoriesRef = useRef(orderedCategories);
  orderedCategoriesRef.current = orderedCategories;

  // サーバー側で確定した並びを表示へ同期する
  useEffect(() => {
    setOrderedCategories(categories);
  }, [categories]);

  // 画面離脱時にdrag中のwindowリスナーを解放する
  useEffect(() => {
    return () => {
      dragSessionRef.current?.dispose();
      dragSessionRef.current = null;
    };
  }, []);

  async function finishDrag(session: DragSession, pointerY: number) {
    const targetIndex = computeDestinationIndex(
      session.rects,
      session.fromIndex,
      pointerY,
    );
    if (targetIndex === session.fromIndex) return;

    // 先に表示を並び替え、保存に失敗したら元の順序へ戻す
    const previousOrder = orderedCategoriesRef.current;
    const dragged = previousOrder[session.fromIndex];
    if (!dragged) return;
    const nextOrder = previousOrder.filter(
      (category) => category.id !== session.categoryId,
    );
    nextOrder.splice(targetIndex, 0, dragged);
    setOrderedCategories(nextOrder);
    setIsReordering(true);
    const state = await repositionCategoryAction(
      groupId,
      session.categoryId,
      targetIndex,
    );
    if (state.status === "error") setOrderedCategories(previousOrder);
    setReorderState(state);
    setIsReordering(false);
  }

  // pointer captureへ依存せず、drag中だけwindowでpointerを追跡する（iOS Safari対応）
  function handleDragStart(
    event: ReactPointerEvent<HTMLButtonElement>,
    categoryId: string,
    index: number,
  ) {
    if (isReordering || dragSessionRef.current) return;
    event.preventDefault();
    const rects = orderedCategoriesRef.current.map(
      (category) =>
        rowRefs.current.get(category.id)?.getBoundingClientRect() ??
        new DOMRect(),
    );

    const handleMove = (moveEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      moveEvent.preventDefault();
      setDragState({
        categoryId: session.categoryId,
        fromIndex: session.fromIndex,
        startY: session.startY,
        currentY: moveEvent.clientY,
        targetIndex: computeDestinationIndex(
          session.rects,
          session.fromIndex,
          moveEvent.clientY,
        ),
      });
    };
    const handleUp = (upEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      session.dispose();
      dragSessionRef.current = null;
      setDragState(null);
      void finishDrag(session, upEvent.clientY);
    };
    const handleCancel = () => {
      dragSessionRef.current?.dispose();
      dragSessionRef.current = null;
      setDragState(null);
    };
    const dispose = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);

    dragSessionRef.current = {
      categoryId,
      fromIndex: index,
      startY: event.clientY,
      rects,
      dispose,
    };
    setDragState({
      categoryId,
      fromIndex: index,
      startY: event.clientY,
      currentY: event.clientY,
      targetIndex: index,
    });
  }

  // ドロップ予定位置の直前・直後を示す行（ドラッグ前の並びにおける位置）
  const indicatorIndex =
    dragState && dragState.targetIndex !== dragState.fromIndex
      ? dragState.targetIndex <= dragState.fromIndex
        ? dragState.targetIndex
        : dragState.targetIndex + 1
      : null;

  return (
    <section aria-labelledby={headingId} className={styles["category-section"]}>
      <h2 id={headingId}>{typeLabels[type]}</h2>
      {orderedCategories.length === 0 ? (
        <p className="field-hint">
          アクティブなカテゴリがありません。下のフォームから追加してください。
        </p>
      ) : (
        <ul className={styles["category-list"]}>
          {orderedCategories.map((category, index) => {
            const isDragging = dragState?.categoryId === category.id;
            const rowClassNames = [
              styles["category-row"],
              isDragging ? styles["category-row-dragging"] : "",
              indicatorIndex === index && !isDragging
                ? styles["category-drop-before"]
                : "",
              indicatorIndex === orderedCategories.length &&
              index === orderedCategories.length - 1 &&
              !isDragging
                ? styles["category-drop-after"]
                : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                className={rowClassNames}
                key={category.id}
                ref={(element) => {
                  if (element) rowRefs.current.set(category.id, element);
                  else rowRefs.current.delete(category.id);
                }}
                style={
                  isDragging && dragState
                    ? {
                        transform: `translateY(${dragState.currentY - dragState.startY}px)`,
                      }
                    : undefined
                }
              >
                <div className={styles["category-row-header"]}>
                  <button
                    aria-label={`${category.name}をドラッグして並び替え`}
                    className={styles["category-drag-handle"]}
                    disabled={isReordering}
                    onPointerDown={(event) =>
                      handleDragStart(event, category.id, index)
                    }
                    type="button"
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                </div>
                <CategoryRowContent
                  category={category}
                  groupId={groupId}
                  isFirst={index === 0}
                  isLast={index === orderedCategories.length - 1}
                />
              </li>
            );
          })}
        </ul>
      )}
      <ActionMessage state={reorderState} />
      <AddCategoryForm groupId={groupId} type={type} />
    </section>
  );
}

export function CategoryManagement({
  groupId,
  expenseCategories,
  incomeCategories,
}: {
  groupId: string;
  expenseCategories: readonly CategorySummary[];
  incomeCategories: readonly CategorySummary[];
}) {
  return (
    <div className={styles["category-manager"]}>
      <CategoryTypeSection
        categories={expenseCategories}
        groupId={groupId}
        type="expense"
      />
      <CategoryTypeSection
        categories={incomeCategories}
        groupId={groupId}
        type="income"
      />
    </div>
  );
}
