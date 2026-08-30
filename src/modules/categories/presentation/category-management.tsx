"use client";

import { useActionState, useId } from "react";
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

function CategoryRow({
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
    <li className={styles["category-row"]}>
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
    </li>
  );
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
  return (
    <section aria-labelledby={headingId} className={styles["category-section"]}>
      <h2 id={headingId}>{typeLabels[type]}</h2>
      {categories.length === 0 ? (
        <p className="field-hint">
          アクティブなカテゴリがありません。下のフォームから追加してください。
        </p>
      ) : (
        <ul className={styles["category-list"]}>
          {categories.map((category, index) => (
            <CategoryRow
              category={category}
              groupId={groupId}
              isFirst={index === 0}
              isLast={index === categories.length - 1}
              key={category.id}
            />
          ))}
        </ul>
      )}
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
