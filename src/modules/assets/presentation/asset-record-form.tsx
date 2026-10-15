"use client";

import Link from "next/link";
import {
  type FocusEvent as ReactFocusEvent,
  type RefObject,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import { formatAnalyticsJpy, formatAnalyticsMonth } from "@/modules/analytics";
import {
  type AmountKeypadKey,
  appendAmountDigit,
  formatAmountExpression,
  removeLastAmountDigit,
  stripAmountGrouping,
} from "@/modules/transactions";
import { AmountKeypad } from "@/modules/transactions/presentation";

import type { AssetRecordFormReady } from "../application/asset-types";
import { assetCellKey } from "../domain/asset-record-form";
import { createAssetRecordUrl } from "../domain/asset-url";
import { type AssetActionState, initialAssetActionState } from "./action-state";
import { deleteAssetSnapshotAction, saveAssetSnapshotAction } from "./actions";

import styles from "./assets.module.css";

type AssetRecordFormProps = Readonly<{ view: AssetRecordFormReady }>;

// 入力欄の数字文字列を安全な整数へ変換する。空欄は0円、不正・上限超えはnull
function parseAmount(value: string): number | null {
  if (value === "") return 0;
  if (!/^\d+$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

// 入力文字列を合計する。不正な値や桁あふれがあればnull
function sumAmounts(values: readonly string[]): number | null {
  let total = 0;
  for (const raw of values) {
    const amount = parseAmount(raw);
    if (amount === null) return null;
    total += amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function formatTotal(total: number | null): string {
  return total === null ? "—" : formatAnalyticsJpy(total);
}

// 送信中は無効化して二重送信を防ぐボタン
function SubmitButton({
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

type AmountFieldProps = Readonly<{
  id: string;
  field: string;
  label: string;
  value: string;
  isActive: boolean;
  onChange: (value: string) => void;
  onActivate: () => void;
  onKey: (key: AmountKeypadKey) => void;
  onDelete: () => void;
  keypadRef: RefObject<HTMLDivElement | null>;
}>;

// 金額欄1つ。inputmode="none"でOSの仮想キーボードを開かず、選択中はその直下に共有テンキーを開く (AC-AST-002-5)
// 送信値は区切りなしの整数のままhidden inputで送り、表示用の金額欄だけを3桁区切りにする
function AmountField({
  id,
  field,
  label,
  value,
  isActive,
  onChange,
  onActivate,
  onKey,
  onDelete,
  keypadRef,
}: AmountFieldProps) {
  return (
    <div className={styles["asset-field"]} data-asset-field={field}>
      <label htmlFor={id}>{label}</label>
      <input name={`asset:${field}`} type="hidden" value={value} />
      <div className={styles["asset-amount-wrap"]}>
        <span aria-hidden="true">¥</span>
        <input
          autoComplete="off"
          data-amount-field={field}
          id={id}
          inputMode="none"
          onChange={(event) =>
            onChange(stripAmountGrouping(event.target.value))
          }
          onClick={onActivate}
          pattern="[0-9,]*"
          placeholder="0"
          type="text"
          value={formatAmountExpression(value)}
        />
      </div>
      {isActive ? (
        <div
          className={styles["asset-keypad"]}
          data-asset-keypad=""
          ref={keypadRef}
        >
          <AmountKeypad onDelete={onDelete} onKey={onKey} open />
        </div>
      ) : null}
    </div>
  );
}

// 既存記録の削除。確認文と確定操作を経てから物理削除する (AC-AST-004-2)
function DeleteRecordForm({ view }: AssetRecordFormProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(
    deleteAssetSnapshotAction.bind(null, view.group.id),
    initialAssetActionState,
  );
  if (!view.existing) return null;

  if (!confirming) {
    return (
      <div className={styles["asset-delete"]}>
        <button
          className="secondary-button"
          onClick={() => setConfirming(true)}
          type="button"
        >
          この月の記録を削除
        </button>
        <ActionMessage state={state} />
      </div>
    );
  }

  return (
    <form action={formAction} className={styles["asset-delete"]}>
      <p className={styles["asset-muted"]} role="status">
        {`${formatAnalyticsMonth(view.month)}の資産記録を削除します。元に戻せません。`}
      </p>
      <input name="month" type="hidden" value={view.month} />
      <input
        name="expectedVersion"
        type="hidden"
        value={String(view.existing.version)}
      />
      <div className={styles["asset-delete-actions"]}>
        <SubmitButton
          className="secondary-button danger-text"
          label="削除を確定する"
          pendingLabel="削除中…"
        />
        <button
          className="secondary-button"
          onClick={() => setConfirming(false)}
          type="button"
        >
          やめる
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

// 記録月の案内。コピーした場合はコピー元の月、既存記録は最終更新者と日時を示す (AC-AST-003-1、AC-AST-004-1)
function RecordNotice({ view }: AssetRecordFormProps) {
  if (view.existing) {
    const updatedAt = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(view.existing.updatedAt));
    return (
      <p className={styles["asset-notice"]}>
        {view.existing.updatedByName
          ? `${updatedAt}に${view.existing.updatedByName}さんが更新した記録です。`
          : `${updatedAt}に更新した記録です。`}
      </p>
    );
  }
  if (view.copiedFrom) {
    return (
      <p className={styles["asset-notice"]} data-asset-copied="">
        {`${formatAnalyticsMonth(view.copiedFrom)}の記録をコピーしました。変わった金額だけ直して保存してください。`}
      </p>
    );
  }
  return (
    <p className={styles["asset-notice"]}>
      最初の記録です。各メンバーの資産額を入力してください。
    </p>
  );
}

// 1か月分の資産額を、メンバーごとのまとまりで入力して1回で保存する (AST-002、AST-003)
function RecordFields({ view }: AssetRecordFormProps) {
  const fieldId = useId();
  const [state, formAction] = useActionState(
    saveAssetSnapshotAction.bind(null, view.group.id),
    initialAssetActionState,
  );
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...view.initialValues,
  }));
  // 開いているテンキーの対象欄。nullは閉じている状態
  const [activeField, setActiveField] = useState<string | null>(null);
  const keypadRef = useRef<HTMLDivElement>(null);

  // 金額欄へfocusしたらその欄でテンキーを開き、金額欄以外へfocusしたら閉じる。テンキー内の操作では開閉しない
  function handleFieldsFocus(event: ReactFocusEvent<HTMLFieldSetElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const field = target.getAttribute("data-amount-field");
    if (field) {
      setActiveField(field);
      return;
    }
    if (keypadRef.current?.contains(target)) return;
    // 保存ボタンへのfocusでテンキーを閉じると、押下中にボタンが上へずれてタップが失われるため閉じない
    if (target.closest('button[type="submit"]')) return;
    setActiveField(null);
  }

  // 開いたテンキーが下部ナビゲーションへ隠れないよう、見える位置まで移動する
  useEffect(() => {
    if (!activeField) return;
    const frame = requestAnimationFrame(() => {
      const keypad = keypadRef.current;
      if (keypad && typeof keypad.scrollIntoView === "function") {
        keypad.scrollIntoView({ block: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeField]);

  // テンキーの入力は選択中の欄だけへ反映する（取引入力と同じ桁追加規則）
  function updateActive(update: (current: string) => string): void {
    if (!activeField) return;
    const key = activeField;
    setValues((current) => ({ ...current, [key]: update(current[key] ?? "") }));
  }
  const handleKey = (key: AmountKeypadKey) =>
    updateActive((current) => appendAmountDigit(current, key));
  const handleDelete = () => updateActive(removeLastAmountDigit);

  const keysOf = (memberId: string) =>
    view.categories.map((category) => assetCellKey(memberId, category.id));
  const total = sumAmounts(Object.values(values));

  return (
    <form action={formAction} className={styles["asset-record-form"]}>
      <input name="month" type="hidden" value={view.month} />
      <input
        name="expectedVersion"
        type="hidden"
        value={view.existing ? String(view.existing.version) : ""}
      />
      {/* 枠なしのfieldsetでfocusの伝播を受け、テンキーの開閉を判定する境界 */}
      <fieldset className={styles["asset-fields"]} onFocus={handleFieldsFocus}>
        <div className={styles["asset-member-groups"]}>
          {view.members.map((member) => (
            <fieldset
              className={styles["asset-member-group"]}
              key={member.memberId}
            >
              <legend>
                <span>{member.displayName}</span>
                <span className={styles["asset-subtotal"]}>
                  {`小計 ${formatTotal(
                    sumAmounts(
                      keysOf(member.memberId).map((key) => values[key] ?? ""),
                    ),
                  )}`}
                </span>
              </legend>
              {view.categories.map((category) => {
                const key = assetCellKey(member.memberId, category.id);
                return (
                  <AmountField
                    field={key}
                    id={`${fieldId}-${key}`}
                    isActive={activeField === key}
                    key={key}
                    keypadRef={keypadRef}
                    label={category.name}
                    onActivate={() => setActiveField(key)}
                    onChange={(value) =>
                      setValues((current) => ({ ...current, [key]: value }))
                    }
                    onDelete={handleDelete}
                    onKey={handleKey}
                    value={values[key] ?? ""}
                  />
                );
              })}
            </fieldset>
          ))}
        </div>
        {activeField === null ? (
          <p className={styles["asset-keypad-hint"]}>
            金額欄をタップするとテンキーを開きます。
          </p>
        ) : null}
        <p className={styles["asset-record-total"]} role="status">
          <span>合計資産額</span>
          <strong>{formatTotal(total)}</strong>
        </p>
        {total === null ? (
          <p className="field-error" role="alert">
            金額は0以上の整数で入力してください。
          </p>
        ) : null}
        <ActionMessage state={state} />
        <SubmitButton
          className="primary-button"
          disabled={total === null}
          label="保存する"
          pendingLabel="保存中…"
        />
      </fieldset>
    </form>
  );
}

// 資産の記録画面。記録月の切替では遷移先の初期値へ入力を作り直し、未保存の入力を持ち越さない (AC-AST-003-2)
export function AssetRecordScreen({ view }: AssetRecordFormProps) {
  return (
    <div className={styles["asset-record"]}>
      <nav aria-label="記録月" className={styles["asset-month-nav"]}>
        {view.previousMonth ? (
          <Link
            aria-label="前月"
            href={createAssetRecordUrl(view.group.id, view.previousMonth)}
          >
            ‹
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        <h2>{formatAnalyticsMonth(view.month)}</h2>
        {view.nextMonth ? (
          <Link
            aria-label="翌月"
            href={createAssetRecordUrl(view.group.id, view.nextMonth)}
          >
            ›
          </Link>
        ) : (
          <button aria-label="翌月" disabled type="button">
            ›
          </button>
        )}
      </nav>
      <RecordNotice view={view} />
      {view.categories.length === 0 || view.members.length === 0 ? (
        <p className={styles["asset-notice"]}>
          {view.canManageCategories ? (
            <>
              記録できる資産区分がありません。
              <Link
                href={`/groups/${encodeURIComponent(view.group.id)}/asset-categories`}
              >
                資産区分を設定する
              </Link>
            </>
          ) : (
            "資産区分はオーナーと管理者が設定します。"
          )}
        </p>
      ) : (
        <RecordFields
          key={`${view.month}:${view.existing?.version ?? "new"}`}
          view={view}
        />
      )}
      <DeleteRecordForm key={`delete:${view.month}`} view={view} />
    </div>
  );
}
