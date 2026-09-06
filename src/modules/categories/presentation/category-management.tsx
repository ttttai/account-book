"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useFormStatus } from "react-dom";

import type { CategorySummary } from "../application/category-types";
import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryType,
} from "../domain/category-input";
import {
  INITIAL_CATEGORY_ACTION_STATE,
  type CategoryActionState,
} from "./action-state";
import {
  addCategoryAction,
  archiveCategoryAction,
  repositionCategoryAction,
  updateCategoryAction,
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

// swatchの読み上げ・tooltip用の色名。パレット (AC-CAT-002-7) の全tokenを網羅する
const colorLabels: Readonly<Record<CategoryColor, string>> = {
  food: "レッド",
  daily: "ブルー",
  home: "ブラウン",
  utilities: "イエロー",
  transport: "ブルーグリーン",
  leisure: "パープル",
  other: "グレー",
  salary: "グリーン",
  extra: "ピンク",
  orange: "オレンジ",
  olive: "オリーブ",
  mint: "ミント",
  sky: "スカイブルー",
  indigo: "インディゴ",
  navy: "ネイビー",
  rose: "ローズ",
  wine: "ワイン",
  charcoal: "チャコール",
};

// 名称・色の変更と削除をまとめた行内編集パネル。結果は親のメッセージ領域へ通知する
function CategoryEditPanel({
  groupId,
  category,
  onFinished,
  onClose,
}: {
  groupId: string;
  category: CategorySummary;
  onFinished: (state: CategoryActionState) => void;
  onClose: () => void;
}) {
  const updateAction = updateCategoryAction.bind(null, groupId, category.id);
  const [updateState, updateFormAction] = useActionState(
    updateAction,
    INITIAL_CATEGORY_ACTION_STATE,
  );
  const deleteAction = archiveCategoryAction.bind(null, groupId, category.id);
  const [deleteState, deleteFormAction] = useActionState(
    deleteAction,
    INITIAL_CATEGORY_ACTION_STATE,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const nameId = useId();

  // 保存・削除が成功したらパネルを閉じ、結果メッセージを一覧側へ引き継ぐ
  useEffect(() => {
    if (updateState.status === "success" && updateState.message) {
      onFinished(updateState);
    }
  }, [updateState, onFinished]);
  useEffect(() => {
    if (deleteState.status === "success" && deleteState.message) {
      onFinished(deleteState);
    }
  }, [deleteState, onFinished]);

  return (
    <div className={styles["category-edit-panel"]}>
      <form action={updateFormAction} className={styles["category-edit-form"]}>
        <label htmlFor={nameId}>名前</label>
        <input
          autoComplete="off"
          defaultValue={category.name}
          id={nameId}
          key={category.name}
          maxLength={30}
          name="name"
          required
        />
        {updateState.fieldErrors?.name?.[0] && (
          <p className="field-error">{updateState.fieldErrors.name[0]}</p>
        )}
        <fieldset className={styles["category-color-fieldset"]}>
          <legend>色</legend>
          <div className={styles["category-color-options"]}>
            {CATEGORY_COLORS.map((color) => (
              <label
                className={styles["category-color-option"]}
                key={color}
                title={colorLabels[color]}
              >
                <input
                  aria-label={colorLabels[color]}
                  defaultChecked={category.color === color}
                  name="color"
                  type="radio"
                  value={color}
                />
                <span
                  aria-hidden="true"
                  className={styles["category-color-swatch"]}
                  data-category-color={color}
                />
                <span
                  aria-hidden="true"
                  className={styles["category-color-check"]}
                >
                  ✓
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className={styles["category-edit-actions"]}>
          <PendingButton
            className="primary-button"
            idleLabel="保存"
            pendingLabel="保存中…"
          />
          <button className="secondary-button" onClick={onClose} type="button">
            キャンセル
          </button>
        </div>
        {updateState.status === "error" && (
          <ActionMessage state={updateState} />
        )}
      </form>

      <div className={styles["category-delete"]}>
        {confirmingDelete ? (
          <>
            <p className="field-hint">
              「{category.name}
              」を削除すると、新規入力の選択肢から外れます。過去の取引の表示と集計は変わりません。
            </p>
            <form
              action={deleteFormAction}
              className={styles["category-edit-actions"]}
            >
              <PendingButton
                className="secondary-button danger-text"
                idleLabel="削除する"
                pendingLabel="削除中…"
              />
              <button
                className="secondary-button"
                onClick={() => setConfirmingDelete(false)}
                type="button"
              >
                やめる
              </button>
            </form>
          </>
        ) : (
          <button
            className="text-button danger-text"
            onClick={() => setConfirmingDelete(true)}
            type="button"
          >
            このカテゴリを削除…
          </button>
        )}
        {deleteState.status === "error" && (
          <ActionMessage state={deleteState} />
        )}
      </div>
    </div>
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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
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

  // 先に表示を並び替え、保存に失敗したら元の順序へ戻す
  async function commitReposition(
    categoryId: string,
    fromIndex: number,
    targetIndex: number,
  ) {
    const previousOrder = orderedCategoriesRef.current;
    const dragged = previousOrder[fromIndex];
    if (!dragged || targetIndex === fromIndex) return;
    const nextOrder = previousOrder.filter(
      (category) => category.id !== categoryId,
    );
    nextOrder.splice(targetIndex, 0, dragged);
    setOrderedCategories(nextOrder);
    setIsReordering(true);
    const state = await repositionCategoryAction(
      groupId,
      categoryId,
      targetIndex,
    );
    if (state.status === "error") setOrderedCategories(previousOrder);
    setReorderState(state);
    setIsReordering(false);
  }

  async function finishDrag(session: DragSession, pointerY: number) {
    const targetIndex = computeDestinationIndex(
      session.rects,
      session.fromIndex,
      pointerY,
    );
    await commitReposition(session.categoryId, session.fromIndex, targetIndex);
  }

  // ハンドルにfocusした状態の上下矢印キーで1つずつ移動する（キーボード並び替え）
  function handleHandleKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    categoryId: string,
    index: number,
  ) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (isReordering || dragSessionRef.current) return;
    const targetIndex = event.key === "ArrowUp" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedCategoriesRef.current.length) {
      return;
    }
    void commitReposition(categoryId, index, targetIndex);
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
                <div className={styles["category-row-main"]}>
                  <button
                    aria-label={`${category.name}をドラッグして並び替え`}
                    className={styles["category-drag-handle"]}
                    disabled={isReordering}
                    onKeyDown={(event) =>
                      handleHandleKeyDown(event, category.id, index)
                    }
                    onPointerDown={(event) =>
                      handleDragStart(event, category.id, index)
                    }
                    type="button"
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                  <span
                    aria-hidden="true"
                    className={styles["category-item-dot"]}
                    data-category-color={category.color}
                  />
                  <span className={styles["category-item-name"]}>
                    {category.name}
                  </span>
                  <button
                    aria-expanded={editingCategoryId === category.id}
                    aria-label={`${category.name}を編集`}
                    className={styles["category-edit-button"]}
                    onClick={() =>
                      setEditingCategoryId((current) =>
                        current === category.id ? null : category.id,
                      )
                    }
                    type="button"
                  >
                    編集
                  </button>
                </div>
                {editingCategoryId === category.id && (
                  <CategoryEditPanel
                    category={category}
                    groupId={groupId}
                    onClose={() => setEditingCategoryId(null)}
                    onFinished={(state) => {
                      setEditingCategoryId(null);
                      setReorderState(state);
                    }}
                  />
                )}
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
