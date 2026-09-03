"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { formatAnalyticsJpy, formatAnalyticsMonth } from "@/modules/analytics";

import type { BudgetViewReady } from "../application/budget-types";
import { disableBudgetAction, saveBudgetAction } from "./actions";
import {
  type BudgetActionState,
  initialBudgetActionState,
} from "./action-state";

import styles from "./budgets.module.css";

type BudgetEditorProps = Readonly<{ view: BudgetViewReady }>;

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

// グループ予算とカテゴリ別予算の入力フォーム。金額欄はOSの数字キーボードを使い、合計と未配分額を即時表示する (AC-BUD-010-3)
function BudgetForm({ view }: BudgetEditorProps) {
  const fieldId = useId();
  const [state, formAction] = useActionState(
    saveBudgetAction.bind(null, view.group.id),
    initialBudgetActionState,
  );
  const [total, setTotal] = useState(
    view.progress ? String(view.progress.limitMinor) : "",
  );
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (view.progress?.categories ?? []).map((category) => [
        category.categoryId,
        String(category.limitMinor),
      ]),
    ),
  );
  const fieldErrors = state.fieldErrors ?? {};

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

      <div className={styles["budget-field"]}>
        <label htmlFor={`${fieldId}-total`}>グループ予算</label>
        <div className={styles["budget-amount-wrap"]}>
          <span aria-hidden="true">¥</span>
          <input
            autoComplete="off"
            id={`${fieldId}-total`}
            inputMode="numeric"
            name="totalAmountMinor"
            onChange={(event) => setTotal(event.target.value)}
            pattern="[0-9]*"
            placeholder="0"
            required
            type="text"
            value={total}
          />
        </div>
        {fieldErrors.totalAmountMinor ? (
          <p className="field-error">
            {fieldErrors.totalAmountMinor.join(" ")}
          </p>
        ) : null}
      </div>

      <fieldset className={styles["budget-fieldset"]}>
        <legend>カテゴリ別予算（任意）</legend>
        {view.expenseCategories.length === 0 ? (
          <p className={styles["budget-muted"]}>
            設定できる支出カテゴリがありません。
          </p>
        ) : (
          <div className={styles["budget-category-fields"]}>
            {view.expenseCategories.map((category) => (
              <div className={styles["budget-field"]} key={category.id}>
                <label htmlFor={`${fieldId}-${category.id}`}>
                  {category.name}
                </label>
                <div className={styles["budget-amount-wrap"]}>
                  <span aria-hidden="true">¥</span>
                  <input
                    autoComplete="off"
                    id={`${fieldId}-${category.id}`}
                    inputMode="numeric"
                    name={`categoryLimit:${category.id}`}
                    onChange={(event) =>
                      setLimits((current) => ({
                        ...current,
                        [category.id]: event.target.value,
                      }))
                    }
                    pattern="[0-9]*"
                    placeholder="未設定"
                    type="text"
                    value={limits[category.id] ?? ""}
                  />
                </div>
              </div>
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
          <p className="field-error">{fieldErrors.categoryLimits.join(" ")}</p>
        ) : null}
      </fieldset>

      <ActionMessage state={state} />
      <SubmitButton
        disabled={overMinor > 0 || limitTotal === null}
        label={submitLabel(view)}
      />
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
    <section className={styles["budget-editor"]}>
      <BudgetForm view={view} />
      {view.progress ? <DisableBudgetForm view={view} /> : null}
    </section>
  );
}
