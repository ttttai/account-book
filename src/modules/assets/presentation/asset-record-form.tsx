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
  /** 金額の入った欄を選んだ直後で、次の数字で置き換える状態 */
  isPendingReplace: boolean;
  onChange: (value: string) => void;
  onActivate: () => void;
}>;

// 金額欄1つ。inputmode="none"でOSの仮想キーボードを開かず、選ぶと画面下部のドックのテンキーで入力する (AC-AST-002-5)
// 送信値は区切りなしの整数のままhidden inputで送り、表示用の金額欄だけを3桁区切りにする
function AmountField({
  id,
  field,
  label,
  value,
  isActive,
  isPendingReplace,
  onChange,
  onActivate,
}: AmountFieldProps) {
  return (
    <div
      className={styles["asset-field"]}
      data-active={isActive ? "" : undefined}
      data-asset-field={field}
    >
      <label htmlFor={id}>{label}</label>
      <input name={`asset:${field}`} type="hidden" value={value} />
      <div
        className={styles["asset-amount-wrap"]}
        data-pending-replace={isPendingReplace ? "" : undefined}
      >
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
    </div>
  );
}

type AssetKeypadDockProps = Readonly<{
  label: string;
  isLast: boolean;
  onKey: (key: AmountKeypadKey) => void;
  onDelete: () => void;
  onNext: () => void;
  onClose: () => void;
  dockRef: RefObject<HTMLElement | null>;
}>;

// 画面下部に重ねて開くテンキーのドック。一覧へ差し込まないため、開閉と欄の切り替えで一覧の位置は動かない (AC-AST-002-5)
// 見出しに入力中の欄、右上に「閉じる」、右列に表示順の次の欄へ移る「次へ」（最後の欄は「完了」）を置く
function AssetKeypadDock({
  label,
  isLast,
  onKey,
  onDelete,
  onNext,
  onClose,
  dockRef,
}: AssetKeypadDockProps) {
  return (
    <section
      aria-label="金額の入力"
      className={styles["asset-dock"]}
      data-asset-keypad=""
      ref={dockRef}
    >
      <div className={styles["asset-dock-heading"]}>
        <p aria-live="polite">{label}</p>
        <button
          aria-label="テンキーを閉じる"
          className={styles["asset-dock-close"]}
          onClick={onClose}
          type="button"
        >
          閉じる
        </button>
      </div>
      <AmountKeypad
        onDelete={onDelete}
        onKey={onKey}
        open
        side={
          <button
            className={styles["asset-dock-next"]}
            onClick={onNext}
            type="button"
          >
            {isLast ? "完了" : "次へ"}
          </button>
        }
      />
    </section>
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
  // 金額の入った欄を選んだ直後は、最初の数字・00で置き換える (AC-AST-002-5)
  const [pendingReplace, setPendingReplace] = useState(false);
  const dockRef = useRef<HTMLElement>(null);

  // 表示順（メンバーの順、各メンバー内は資産区分の並び順）の欄。「次へ」の移動とドックの見出しに使う
  const cells = view.members.flatMap((member) =>
    view.categories.map((category) => ({
      key: assetCellKey(member.memberId, category.id),
      label: `${member.displayName}・${category.name}`,
    })),
  );
  const activeIndex = cells.findIndex((cell) => cell.key === activeField);

  function activate(field: string): void {
    setActiveField(field);
    setPendingReplace((values[field] ?? "") !== "");
  }

  function closeKeypad(): void {
    setActiveField(null);
    setPendingReplace(false);
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
  }

  // 金額欄へfocusしたらその欄でテンキーを開き、金額欄以外へfocusしたら閉じる。ドック内の操作では開閉しない
  function handleFieldsFocus(event: ReactFocusEvent<HTMLFieldSetElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const field = target.getAttribute("data-amount-field");
    if (field) {
      if (field !== activeField) activate(field);
      return;
    }
    if (dockRef.current?.contains(target)) return;
    // 保存へのfocusで閉じると末尾の余白が消えてscroll位置が変わり、押下中のボタンがずれてタップが失われる
    if (target.closest('button[type="submit"]')) return;
    setActiveField(null);
    setPendingReplace(false);
  }

  // 選んだ欄がドックに隠れる場合だけ、ドックの上に見えるまでscrollする（scroll-marginでドックの高さを空ける）
  useEffect(() => {
    if (!activeField) return;
    const frame = requestAnimationFrame(() => {
      const field = document.getElementById(`${fieldId}-${activeField}`);
      const row = field?.closest("[data-asset-field]");
      if (row && typeof row.scrollIntoView === "function") {
        row.scrollIntoView({ block: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeField, fieldId]);

  // テンキーの入力は選択中の欄だけへ反映する。置き換え待ちなら空から入力し直す（取引入力と同じ桁追加規則）
  function handleKey(key: AmountKeypadKey): void {
    if (!activeField) return;
    const field = activeField;
    const replace = pendingReplace;
    setPendingReplace(false);
    setValues((current) => ({
      ...current,
      [field]: appendAmountDigit(replace ? "" : (current[field] ?? ""), key),
    }));
  }

  function handleDelete(): void {
    if (!activeField) return;
    const field = activeField;
    setPendingReplace(false);
    setValues((current) => ({
      ...current,
      [field]: removeLastAmountDigit(current[field] ?? ""),
    }));
  }

  // 表示順の次の欄へfocusを移す。最後の欄ではドックを閉じる
  function handleNext(): void {
    const next = cells[activeIndex + 1];
    if (!next) {
      closeKeypad();
      return;
    }
    const input = document.getElementById(`${fieldId}-${next.key}`);
    if (input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true });
    }
    activate(next.key);
  }

  const keysOf = (memberId: string) =>
    view.categories.map((category) => assetCellKey(memberId, category.id));
  const total = sumAmounts(Object.values(values));

  return (
    <form
      action={formAction}
      className={styles["asset-record-form"]}
      data-dock-open={activeField ? "" : undefined}
    >
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
            // legendはWebKitで枠線の上へ描かれるため、見出しを要素で置き表示名をgroupの名前にする (AC-AST-010-4)
            <fieldset
              aria-labelledby={`${fieldId}-${member.memberId}-heading`}
              className={styles["asset-member-group"]}
              key={member.memberId}
            >
              <div className={styles["asset-member-heading"]}>
                <span id={`${fieldId}-${member.memberId}-heading`}>
                  {member.displayName}
                </span>
                <span className={styles["asset-subtotal"]}>
                  {`小計 ${formatTotal(
                    sumAmounts(
                      keysOf(member.memberId).map((key) => values[key] ?? ""),
                    ),
                  )}`}
                </span>
              </div>
              {view.categories.map((category) => {
                const key = assetCellKey(member.memberId, category.id);
                return (
                  <AmountField
                    field={key}
                    id={`${fieldId}-${key}`}
                    isActive={activeField === key}
                    isPendingReplace={activeField === key && pendingReplace}
                    key={key}
                    label={category.name}
                    onActivate={() => {
                      if (activeField !== key) activate(key);
                    }}
                    onChange={(value) => {
                      setPendingReplace(false);
                      setValues((current) => ({ ...current, [key]: value }));
                    }}
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
        {activeField !== null && activeIndex >= 0 ? (
          <AssetKeypadDock
            dockRef={dockRef}
            isLast={activeIndex === cells.length - 1}
            label={cells[activeIndex]?.label ?? ""}
            onClose={closeKeypad}
            onDelete={handleDelete}
            onKey={handleKey}
            onNext={handleNext}
          />
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
