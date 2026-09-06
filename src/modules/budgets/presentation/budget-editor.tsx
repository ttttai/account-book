"use client";

import {
  type FocusEvent as ReactFocusEvent,
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
  removeLastAmountDigit,
} from "@/modules/transactions";
import { AmountKeypad } from "@/modules/transactions/presentation";

import type { BudgetViewReady } from "../application/budget-types";
import { disableBudgetAction, saveBudgetAction } from "./actions";
import {
  type BudgetActionState,
  initialBudgetActionState,
} from "./action-state";

import styles from "./budgets.module.css";

type BudgetEditorProps = Readonly<{ view: BudgetViewReady }>;

/** グループ予算欄の識別子。カテゴリ欄はカテゴリIDで識別する */
const TOTAL_FIELD = "total";

// 入力欄の数字文字列を安全な整数へ変換する。空欄・不正・上限超えはnull
function parseAmount(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

// カテゴリ予算の入力文字列を合計する。空欄は未設定として除き、不正な値や桁あふれがあればnull
function sumCategoryLimits(values: readonly string[]): number | null {
  let total = 0;
  for (const raw of values) {
    if (raw === "") continue;
    const amount = parseAmount(raw);
    if (amount === null) return null;
    total += amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

// 送信中は無効化して二重送信を防ぐ保存ボタン
function SubmitButton({
  label,
  disabled,
}: Readonly<{ label: string; disabled: boolean }>) {
  const { pending } = useFormStatus();
  return (
    <button
      className="primary-button"
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? "保存中…" : label}
    </button>
  );
}

function ActionMessage({ state }: Readonly<{ state: BudgetActionState }>) {
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

// 選択月に既存改定があれば更新、適用改定が別の月なら新規改定、未設定なら新規設定 (AC-BUD-005-1、AC-BUD-009-1)
function submitLabel(view: BudgetViewReady): string {
  if (view.revisionAtMonth?.status === "active") return "予算を保存";
  if (view.progress) return "この月から変更";
  return "予算を設定";
}

function initialCategoryLimits(view: BudgetViewReady): Record<string, string> {
  return Object.fromEntries(
    (view.progress?.categories ?? []).map((category) => [
      category.categoryId,
      String(category.limitMinor),
    ]),
  );
}

type AmountFieldProps = Readonly<{
  id: string;
  field: string;
  label: string;
  name: string;
  value: string;
  placeholder: string;
  required?: boolean;
  isActive: boolean;
  showHint: boolean;
  onChange: (value: string) => void;
  onActivate: () => void;
  onKey: (key: AmountKeypadKey) => void;
  onDelete: () => void;
  keypadRef: React.RefObject<HTMLDivElement | null>;
}>;

// 金額欄1つ。inputmode="none"でOSの仮想キーボードを開かず、選択中はその直下に共有テンキーを開く (AC-BUD-010-4)
// 物理キーボードとスクリーンリーダーからの入力はonChangeで維持する
function AmountField({
  id,
  field,
  label,
  name,
  value,
  placeholder,
  required = false,
  isActive,
  showHint,
  onChange,
  onActivate,
  onKey,
  onDelete,
  keypadRef,
}: AmountFieldProps) {
  const hintId = `${id}-keypad-hint`;
  return (
    <div className={styles["budget-field"]} data-budget-field={field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles["budget-amount-wrap"]}>
        <span aria-hidden="true">¥</span>
        <input
          aria-describedby={showHint ? hintId : undefined}
          autoComplete="off"
          data-amount-field={field}
          id={id}
          inputMode="none"
          name={name}
          onChange={(event) => onChange(event.target.value)}
          onClick={onActivate}
          pattern="[0-9]*"
          placeholder={placeholder}
          required={required}
          type="text"
          value={value}
        />
      </div>
      {isActive ? (
        <div
          className={styles["budget-keypad"]}
          data-budget-keypad=""
          ref={keypadRef}
        >
          <AmountKeypad onDelete={onDelete} onKey={onKey} open />
        </div>
      ) : null}
      {showHint ? (
        <p className={styles["budget-keypad-hint"]} id={hintId}>
          金額欄をタップするとテンキーを開きます。
        </p>
      ) : null}
    </div>
  );
}

// グループ予算とカテゴリ別予算の入力フォーム。合計と未配分額を即時表示する (AC-BUD-010-3、AC-BUD-010-4)
function BudgetForm({ view }: BudgetEditorProps) {
  const fieldId = useId();
  const [state, formAction] = useActionState(
    saveBudgetAction.bind(null, view.group.id),
    initialBudgetActionState,
  );
  const [total, setTotal] = useState(
    view.progress ? String(view.progress.limitMinor) : "",
  );
  const [limits, setLimits] = useState(() => initialCategoryLimits(view));
  const revisionKey = `${view.progress?.effectiveMonth ?? ""}:${view.progress?.version ?? ""}:${view.revisionAtMonth?.version ?? ""}`;
  const [inputRevisionKey, setInputRevisionKey] = useState(revisionKey);

  // 改定が変わったときだけ入力を同期し、古い金額を新versionで送らない。実績更新では入力・focusを維持する。
  if (inputRevisionKey !== revisionKey) {
    setInputRevisionKey(revisionKey);
    setTotal(view.progress ? String(view.progress.limitMinor) : "");
    setLimits(initialCategoryLimits(view));
  }
  // 開いているテンキーの対象欄。nullは閉じている状態
  const [activeField, setActiveField] = useState<string | null>(null);
  const keypadRef = useRef<HTMLDivElement>(null);
  const fieldErrors = state.fieldErrors ?? {};

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
    setActiveField(null);
  }

  // 開いたテンキーが下部ナビゲーションへ隠れないよう、scroll-margin込みで見える位置まで移動する
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
    if (activeField === TOTAL_FIELD) {
      setTotal(update);
      return;
    }
    const categoryId = activeField;
    setLimits((current) => ({
      ...current,
      [categoryId]: update(current[categoryId] ?? ""),
    }));
  }
  const handleKey = (key: AmountKeypadKey) =>
    updateActive((current) => appendAmountDigit(current, key));
  const handleDelete = () => updateActive(removeLastAmountDigit);

  const totalMinor = parseAmount(total);
  const limitTotal = sumCategoryLimits(
    view.expenseCategories.map((category) => limits[category.id] ?? ""),
  );
  const overMinor =
    totalMinor !== null && limitTotal !== null && limitTotal > totalMinor
      ? limitTotal - totalMinor
      : 0;

  return (
    <form action={formAction} className={styles["budget-form"]}>
      <h3>{view.progress ? "予算を変更" : "予算を設定"}</h3>
      <p className={styles["budget-muted"]}>
        {`${formatAnalyticsMonth(view.month)}から後の月へ同じ予算を適用します。過去月の予算は変わりません。`}
      </p>
      <input name="effectiveMonth" type="hidden" value={view.month} />
      <input
        name="expectedVersion"
        type="hidden"
        value={view.revisionAtMonth ? String(view.revisionAtMonth.version) : ""}
      />

      {/* 枠なしのfieldsetでfocusの伝播を受け、テンキーの開閉を判定する境界 */}
      <fieldset className={styles["budget-fields"]} onFocus={handleFieldsFocus}>
        <AmountField
          field={TOTAL_FIELD}
          id={`${fieldId}-total`}
          isActive={activeField === TOTAL_FIELD}
          keypadRef={keypadRef}
          label="グループ予算"
          name="totalAmountMinor"
          onActivate={() => setActiveField(TOTAL_FIELD)}
          onChange={setTotal}
          onDelete={handleDelete}
          onKey={handleKey}
          placeholder="0"
          required
          showHint={activeField === null}
          value={total}
        />
        {fieldErrors.totalAmountMinor ? (
          <p className="field-error">
            {fieldErrors.totalAmountMinor.join(" ")}
          </p>
        ) : null}

        <fieldset className={styles["budget-fieldset"]}>
          <legend>カテゴリ別予算（任意）</legend>
          {view.expenseCategories.length === 0 ? (
            <p className={styles["budget-muted"]}>
              設定できる支出カテゴリがありません。
            </p>
          ) : (
            <div className={styles["budget-category-fields"]}>
              {view.expenseCategories.map((category) => (
                <AmountField
                  field={category.id}
                  id={`${fieldId}-${category.id}`}
                  isActive={activeField === category.id}
                  key={category.id}
                  keypadRef={keypadRef}
                  label={category.name}
                  name={`categoryLimit:${category.id}`}
                  onActivate={() => setActiveField(category.id)}
                  onChange={(value) =>
                    setLimits((current) => ({
                      ...current,
                      [category.id]: value,
                    }))
                  }
                  onDelete={handleDelete}
                  onKey={handleKey}
                  placeholder="未設定"
                  showHint={false}
                  value={limits[category.id] ?? ""}
                />
              ))}
            </div>
          )}
          {overMinor > 0 ? (
            <p className="field-error" role="alert">
              {`カテゴリ予算の合計がグループ予算を ${formatAnalyticsJpy(overMinor)} 超えています。`}
            </p>
          ) : (
            <p className={styles["budget-form-summary"]} role="status">
              {limitTotal === null
                ? "カテゴリ予算は1円以上の整数で入力してください。"
                : `カテゴリ予算の合計 ${formatAnalyticsJpy(limitTotal)} ／ 未配分 ${
                    totalMinor === null
                      ? "—"
                      : formatAnalyticsJpy(Math.max(totalMinor - limitTotal, 0))
                  }`}
            </p>
          )}
          {fieldErrors.categoryLimits ? (
            <p className="field-error">
              {fieldErrors.categoryLimits.join(" ")}
            </p>
          ) : null}
        </fieldset>

        <ActionMessage state={state} />
        <SubmitButton
          disabled={overMinor > 0 || limitTotal === null}
          label={submitLabel(view)}
        />
      </fieldset>
    </form>
  );
}

// 停止は確認操作を経て確定する。選択月を開始月とする停止改定を保存する (AC-BUD-006-1)
function DisableBudgetForm({ view }: BudgetEditorProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(
    disableBudgetAction.bind(null, view.group.id),
    initialBudgetActionState,
  );

  if (!confirming) {
    return (
      <div className={styles["budget-disable"]}>
        <button
          className="secondary-button"
          onClick={() => setConfirming(true)}
          type="button"
        >
          この月から停止する
        </button>
        <ActionMessage state={state} />
      </div>
    );
  }

  return (
    <form action={formAction} className={styles["budget-disable"]}>
      <p className={styles["budget-muted"]}>
        {`${formatAnalyticsMonth(view.month)}以降は予算未設定になります。過去の予算と改定履歴は残ります。`}
      </p>
      <input name="effectiveMonth" type="hidden" value={view.month} />
      <input
        name="expectedVersion"
        type="hidden"
        value={view.revisionAtMonth ? String(view.revisionAtMonth.version) : ""}
      />
      <div className={styles["budget-disable-actions"]}>
        <SubmitButton disabled={false} label="停止を確定する" />
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

// 予算の設定・改定・停止操作。owner/adminかつ当月以降の月だけに表示する (AC-BUD-001-1、AC-BUD-001-3)
export function BudgetEditor({ view }: BudgetEditorProps) {
  if (!view.canManage) {
    return (
      <p className={styles["budget-readonly"]}>
        予算の設定はオーナーと管理者が行います。
      </p>
    );
  }
  if (!view.canEditMonth) {
    return (
      <p className={styles["budget-readonly"]}>
        過去月の予算は変更できません。
      </p>
    );
  }
  return (
    <section
      className={styles["budget-editor"]}
      key={`${view.group.id}:${view.month}`}
    >
      <BudgetForm view={view} />
      {view.progress ? <DisableBudgetForm view={view} /> : null}
    </section>
  );
}
