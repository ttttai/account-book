"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  CATEGORY_COLOR_LABELS,
  CATEGORY_COLORS,
  type CategoryColor,
} from "@/modules/categories";

import type {
  AssetCategorySetting,
  AssetCategorySettingsData,
} from "../application/asset-types";
import {
  ASSET_ACTIVE_CATEGORY_LIMIT,
  ASSET_CATEGORY_NAME_MAX_LENGTH,
} from "../domain/asset-input";
import { type AssetActionState, initialAssetActionState } from "./action-state";
import {
  createAssetCategoryAction,
  setAssetCategoryArchivedAction,
  updateAssetCategoryAction,
} from "./actions";

import styles from "./assets.module.css";

function PendingButton({
  label,
  pendingLabel,
  className,
  disabled = false,
}: Readonly<{
  label: string;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
}>) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending || disabled} type="submit">
      {pending ? pendingLabel : label}
    </button>
  );
}

function ActionMessage({ state }: Readonly<{ state: AssetActionState }>) {
  if (!state.message) return null;
  return (
    <p
      className={`form-message ${state.status === "success" ? "success" : "error"}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

// 色は18色tokenのswatchから選び、選択状態を枠と記号でも示す (AC-AST-006-2、AC-CAT-002-7と同じ部品構成)
function ColorPicker({
  defaultColor,
}: Readonly<{ defaultColor: CategoryColor }>) {
  return (
    <fieldset className={styles["asset-color-fieldset"]}>
      <legend>色</legend>
      <div className={styles["asset-color-options"]}>
        {CATEGORY_COLORS.map((color) => (
          <label
            className={styles["asset-color-option"]}
            key={color}
            title={CATEGORY_COLOR_LABELS[color]}
          >
            <input
              aria-label={CATEGORY_COLOR_LABELS[color]}
              defaultChecked={defaultColor === color}
              name="color"
              type="radio"
              value={color}
            />
            <span
              aria-hidden="true"
              className={styles["asset-color-swatch"]}
              data-category-color={color}
            />
            <span aria-hidden="true" className={styles["asset-color-check"]}>
              ✓
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type EditPanelProps = Readonly<{
  groupId: string;
  category: AssetCategorySetting;
  onClose: () => void;
}>;

// 名称・色の変更と削除（アーカイブ）をまとめた行内編集パネル。削除は確認操作を経て行う
function EditPanel({ groupId, category, onClose }: EditPanelProps) {
  const nameId = useId();
  const [updateState, updateAction] = useActionState(
    updateAssetCategoryAction.bind(null, groupId, category.id),
    initialAssetActionState,
  );
  const [archiveState, archiveAction] = useActionState(
    setAssetCategoryArchivedAction.bind(null, groupId, category.id, true),
    initialAssetActionState,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 保存・削除が成功したら、更新後の一覧を見せるためにパネルを閉じる
  useEffect(() => {
    if (updateState.status === "success" || archiveState.status === "success") {
      onClose();
    }
  }, [updateState.status, archiveState.status, onClose]);

  return (
    <div className={styles["asset-category-panel"]}>
      <form action={updateAction} className={styles["asset-category-form"]}>
        <input name="expectedVersion" type="hidden" value={category.version} />
        <label htmlFor={nameId}>名前</label>
        <input
          autoComplete="off"
          defaultValue={category.name}
          id={nameId}
          maxLength={ASSET_CATEGORY_NAME_MAX_LENGTH}
          name="name"
          required
        />
        {updateState.fieldErrors?.name?.[0] ? (
          <p className="field-error">{updateState.fieldErrors.name[0]}</p>
        ) : null}
        <ColorPicker defaultColor={category.color} />
        <div className={styles["asset-category-actions"]}>
          <PendingButton
            className="primary-button"
            label="保存"
            pendingLabel="保存中…"
          />
          <button className="secondary-button" onClick={onClose} type="button">
            キャンセル
          </button>
        </div>
        {updateState.status === "error" ? (
          <ActionMessage state={updateState} />
        ) : null}
      </form>
      {confirmingDelete ? (
        <form
          action={archiveAction}
          className={styles["asset-category-delete"]}
        >
          <input
            name="expectedVersion"
            type="hidden"
            value={category.version}
          />
          <p className={styles["asset-muted"]}>
            {`「${category.name}」を削除します。過去の資産記録の表示と合計は変わりません。記録画面の入力欄から外れます。`}
          </p>
          <div className={styles["asset-category-actions"]}>
            <PendingButton
              className="secondary-button danger-text"
              label="削除を確定する"
              pendingLabel="削除中…"
            />
            <button
              className="secondary-button"
              onClick={() => setConfirmingDelete(false)}
              type="button"
            >
              やめる
            </button>
          </div>
          <ActionMessage state={archiveState} />
        </form>
      ) : (
        <button
          className="text-button danger-text"
          onClick={() => setConfirmingDelete(true)}
          type="button"
        >
          削除
        </button>
      )}
    </div>
  );
}

// 削除した区分を元に戻す。アクティブが上限のときは無効化する (AC-AST-006-2)
function RestoreButton({
  groupId,
  category,
  disabled,
}: Readonly<{
  groupId: string;
  category: AssetCategorySetting;
  disabled: boolean;
}>) {
  const [state, action] = useActionState(
    setAssetCategoryArchivedAction.bind(null, groupId, category.id, false),
    initialAssetActionState,
  );
  return (
    <form action={action} className={styles["asset-restore"]}>
      <input name="expectedVersion" type="hidden" value={category.version} />
      <span
        aria-hidden="true"
        className={styles["asset-dot"]}
        data-category-color={category.color}
      />
      <span className={styles["asset-category-name"]}>{category.name}</span>
      <PendingButton
        className="secondary-button"
        disabled={disabled}
        label="元に戻す"
        pendingLabel="処理中…"
      />
      {state.status === "error" ? <ActionMessage state={state} /> : null}
    </form>
  );
}

// 資産区分の管理。追加・名称と色の変更・削除（アーカイブ）・復元を提供する (AST-006)
export function AssetCategorySettings({
  data,
}: Readonly<{ data: AssetCategorySettingsData }>) {
  const nameId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createState, createAction] = useActionState(
    createAssetCategoryAction.bind(null, data.group.id),
    initialAssetActionState,
  );
  const isFull = data.active.length >= ASSET_ACTIVE_CATEGORY_LIMIT;
  // 追加に成功したら入力を空に戻すため、フォームを作り直す
  const [createFormKey, setCreateFormKey] = useState(0);
  useEffect(() => {
    if (createState.status === "success") setCreateFormKey((key) => key + 1);
  }, [createState]);

  return (
    <div className={styles["asset-category-settings"]}>
      <section>
        <h2>使用中の資産区分</h2>
        <ul className={styles["asset-category-list"]}>
          {data.active.map((category) => (
            <li key={category.id}>
              <div className={styles["asset-category-row"]}>
                <span
                  aria-hidden="true"
                  className={styles["asset-dot"]}
                  data-category-color={category.color}
                />
                <span className={styles["asset-category-name"]}>
                  {category.name}
                </span>
                <button
                  aria-expanded={editingId === category.id}
                  aria-label={`${category.name}を編集`}
                  className="secondary-button"
                  onClick={() =>
                    setEditingId((current) =>
                      current === category.id ? null : category.id,
                    )
                  }
                  type="button"
                >
                  編集
                </button>
              </div>
              {editingId === category.id ? (
                <EditPanel
                  category={category}
                  groupId={data.group.id}
                  onClose={() => setEditingId(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>資産区分を追加</h2>
        {isFull ? (
          <p className={styles["asset-notice"]} role="status">
            資産区分は8件まで登録できます。
          </p>
        ) : null}
        <form
          action={createAction}
          className={styles["asset-category-form"]}
          key={createFormKey}
        >
          <label htmlFor={nameId}>名前</label>
          <input
            autoComplete="off"
            disabled={isFull}
            id={nameId}
            maxLength={ASSET_CATEGORY_NAME_MAX_LENGTH}
            name="name"
            placeholder="例: 暗号資産"
            required
          />
          {createState.fieldErrors?.name?.[0] ? (
            <p className="field-error">{createState.fieldErrors.name[0]}</p>
          ) : null}
          <ColorPicker defaultColor="rose" />
          <PendingButton
            className="primary-button"
            disabled={isFull}
            label="追加する"
            pendingLabel="追加中…"
          />
          <ActionMessage state={createState} />
        </form>
      </section>

      {data.archived.length > 0 ? (
        <details className={styles["asset-archived"]}>
          <summary>{`削除した区分（${data.archived.length}件）`}</summary>
          <ul>
            {data.archived.map((category) => (
              <li key={category.id}>
                <RestoreButton
                  category={category}
                  disabled={isFull}
                  groupId={data.group.id}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
