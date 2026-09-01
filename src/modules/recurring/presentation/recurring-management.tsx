"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import type {
  RecurringManagementView,
  RecurringSummary,
} from "../application/recurring-types";
import { formatRecurringJpy } from "../domain/recurring-jpy";
import {
  createRecurringAction,
  endRecurringAction,
  updateRecurringAction,
} from "./actions";
import {
  initialRecurringActionState,
  type RecurringActionState,
} from "./action-state";
import styles from "./recurring.module.css";

type RecurringManagementProps = Readonly<{ view: RecurringManagementView }>;

const DAY_OPTIONS = Array.from({ length: 28 }, (_, index) => index + 1);

// 送信中は無効化して二重送信を防ぐ保存ボタン
function SaveButton({ label }: Readonly<{ label: string }>) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? "保存中…" : label}
    </button>
  );
}

function ActionMessage({ state }: Readonly<{ state: RecurringActionState }>) {
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

// 「毎月○日に○円」と負担内訳の要約（画面仕様）
function ScheduleSummary({
  dayOfMonth,
  amountMinor,
  allocations,
}: Readonly<{
  dayOfMonth: number;
  amountMinor: number;
  allocations: readonly Readonly<{
    displayName: string;
    amountMinor: number;
  }>[];
}>) {
  return (
    <p className={styles["recurring-summary"]}>
      毎月{dayOfMonth}日に{formatRecurringJpy(amountMinor)}
      {allocations.length > 0
        ? ` ／ ${allocations
            .map(
              (allocation) =>
                `${allocation.displayName} ${formatRecurringJpy(allocation.amountMinor)}`,
            )
            .join(" ・ ")}`
        : ""}
    </p>
  );
}

type FormFieldsProps = Readonly<{
  view: RecurringManagementView;
  recurring?: RecurringSummary;
  state: RecurringActionState;
}>;

// 作成・編集で共通の入力欄。種別で受取者／支払者と負担方法の表示を切り替える
function RecurringFormFields({ view, recurring, state }: FormFieldsProps) {
  const fieldId = useId();
  const [type, setType] = useState<"expense" | "income">(
    recurring?.type ?? "expense",
  );
  const [allocationMethod, setAllocationMethod] = useState<
    "equal" | "single" | "custom"
  >(recurring && recurring.allocations.length > 1 ? "equal" : "single");
  const categories = view.categories.filter(
    (category) => category.type === type,
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <>
      <fieldset className={styles["recurring-fieldset"]}>
        <legend>種別</legend>
        <div className={styles["recurring-segmented"]}>
          {(
            [
              ["expense", "支出"],
              ["income", "収入"],
            ] as const
          ).map(([optionValue, label]) => (
            <label key={optionValue}>
              <input
                checked={type === optionValue}
                name="type"
                onChange={() => setType(optionValue)}
                type="radio"
                value={optionValue}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles["recurring-field"]}>
        <label htmlFor={`${fieldId}-name`}>名称</label>
        <input
          defaultValue={recurring?.name ?? ""}
          id={`${fieldId}-name`}
          maxLength={40}
          name="name"
          placeholder="家賃、給与など"
          required
          type="text"
        />
        {fieldErrors.name ? (
          <p className="field-error">{fieldErrors.name.join(" ")}</p>
        ) : null}
      </div>

      <div className={styles["recurring-field-row"]}>
        <div className={styles["recurring-field"]}>
          <label htmlFor={`${fieldId}-amount`}>金額</label>
          <input
            defaultValue={recurring ? String(recurring.amountMinor) : ""}
            id={`${fieldId}-amount`}
            inputMode="numeric"
            name="amountMinor"
            required
            type="text"
          />
          {fieldErrors.amountMinor ? (
            <p className="field-error">{fieldErrors.amountMinor.join(" ")}</p>
          ) : null}
        </div>
        <div className={styles["recurring-field"]}>
          <label htmlFor={`${fieldId}-day`}>毎月の日付</label>
          <select
            defaultValue={String(recurring?.dayOfMonth ?? 1)}
            id={`${fieldId}-day`}
            name="dayOfMonth"
          >
            {DAY_OPTIONS.map((day) => (
              <option key={day} value={day}>
                {day}日
              </option>
            ))}
          </select>
          {fieldErrors.dayOfMonth ? (
            <p className="field-error">{fieldErrors.dayOfMonth.join(" ")}</p>
          ) : null}
        </div>
      </div>

      <div className={styles["recurring-field-row"]}>
        <div className={styles["recurring-field"]}>
          <label htmlFor={`${fieldId}-start`}>開始月</label>
          <input
            defaultValue={recurring?.startMonth ?? view.currentMonth}
            id={`${fieldId}-start`}
            name="startMonth"
            required
            type="month"
          />
          {fieldErrors.startMonth ? (
            <p className="field-error">{fieldErrors.startMonth.join(" ")}</p>
          ) : null}
        </div>
        <div className={styles["recurring-field"]}>
          <label htmlFor={`${fieldId}-end`}>終了月（任意）</label>
          <input
            defaultValue={recurring?.endMonth ?? ""}
            id={`${fieldId}-end`}
            name="endMonth"
            type="month"
          />
          {fieldErrors.endMonth ? (
            <p className="field-error">{fieldErrors.endMonth.join(" ")}</p>
          ) : null}
        </div>
      </div>

      <div className={styles["recurring-field"]}>
        <label htmlFor={`${fieldId}-category`}>カテゴリ</label>
        <select
          defaultValue={
            recurring
              ? (categories.find(
                  (category) => category.name === recurring.categoryName,
                )?.id ?? "")
              : ""
          }
          id={`${fieldId}-category`}
          name="categoryId"
          required
        >
          <option value="">選択してください</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {fieldErrors.categoryId ? (
          <p className="field-error">{fieldErrors.categoryId.join(" ")}</p>
        ) : null}
      </div>

      <div className={styles["recurring-field"]}>
        <label htmlFor={`${fieldId}-party`}>
          {type === "income" ? "受け取る人" : "支払う人"}
        </label>
        <select
          defaultValue={
            recurring?.partyMembershipId ??
            view.members.find((member) => member.isCurrentUser)?.membershipId ??
            ""
          }
          id={`${fieldId}-party`}
          name="partyMemberId"
          required
        >
          {view.members.map((member) => (
            <option key={member.membershipId} value={member.membershipId}>
              {member.displayName}
              {member.isCurrentUser ? "（自分）" : ""}
            </option>
          ))}
        </select>
        {fieldErrors.partyMemberId ? (
          <p className="field-error">{fieldErrors.partyMemberId.join(" ")}</p>
        ) : null}
      </div>

      {type === "expense" ? (
        <fieldset className={styles["recurring-fieldset"]}>
          <legend>負担方法</legend>
          <div className={styles["recurring-segmented"]}>
            {(
              [
                ["single", "1人"],
                ["equal", "均等"],
              ] as const
            ).map(([optionValue, label]) => (
              <label key={optionValue}>
                <input
                  checked={allocationMethod === optionValue}
                  name="allocationMethod"
                  onChange={() => setAllocationMethod(optionValue)}
                  type="radio"
                  value={optionValue}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className={styles["recurring-members"]}>
            {view.members.map((member) => (
              <label
                className={styles["recurring-check"]}
                key={member.membershipId}
              >
                <input
                  defaultChecked={
                    recurring
                      ? recurring.allocations.some(
                          (allocation) =>
                            allocation.membershipId === member.membershipId,
                        )
                      : member.isCurrentUser
                  }
                  name="selectedMemberIds"
                  type="checkbox"
                  value={member.membershipId}
                />
                <span>
                  {member.displayName}
                  {member.isCurrentUser ? "（自分）" : ""}
                </span>
              </label>
            ))}
          </div>
          {fieldErrors.allocationMethod ? (
            <p className="field-error">
              {fieldErrors.allocationMethod.join(" ")}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className={styles["recurring-field"]}>
        <label htmlFor={`${fieldId}-memo`}>メモ（任意）</label>
        <textarea
          defaultValue={recurring?.memo ?? ""}
          id={`${fieldId}-memo`}
          maxLength={500}
          name="memo"
        />
        {fieldErrors.memo ? (
          <p className="field-error">{fieldErrors.memo.join(" ")}</p>
        ) : null}
      </div>
    </>
  );
}

function CreateRecurringForm({ view }: RecurringManagementProps) {
  const [state, formAction] = useActionState(
    createRecurringAction.bind(null, view.group.id),
    initialRecurringActionState,
  );

  return (
    <form action={formAction} className={styles["recurring-form"]}>
      <h2>定期取引を追加</h2>
      <RecurringFormFields state={state} view={view} />
      <ActionMessage state={state} />
      <SaveButton label="定期取引を保存" />
    </form>
  );
}

function EditRecurringForm({
  view,
  recurring,
  onClose,
}: RecurringManagementProps &
  Readonly<{ recurring: RecurringSummary; onClose: () => void }>) {
  const [state, formAction] = useActionState(
    updateRecurringAction.bind(null, view.group.id, recurring.id),
    initialRecurringActionState,
  );

  return (
    <form action={formAction} className={styles["recurring-form"]}>
      <h2>{recurring.name}を編集</h2>
      <input
        name="expectedVersion"
        type="hidden"
        value={String(recurring.version)}
      />
      <RecurringFormFields recurring={recurring} state={state} view={view} />
      <ActionMessage state={state} />
      <div className={styles["recurring-form-actions"]}>
        <SaveButton label="変更を保存" />
        <button className="secondary-button" onClick={onClose} type="button">
          閉じる
        </button>
      </div>
    </form>
  );
}

function EndRecurringForm({
  view,
  recurring,
}: RecurringManagementProps & Readonly<{ recurring: RecurringSummary }>) {
  const [state, formAction] = useActionState(
    endRecurringAction.bind(null, view.group.id, recurring.id),
    initialRecurringActionState,
  );

  return (
    <form action={formAction} className={styles["recurring-end-form"]}>
      <input
        name="expectedVersion"
        type="hidden"
        value={String(recurring.version)}
      />
      <input name="endMonth" type="hidden" value={view.currentMonth} />
      <button className="secondary-button" type="submit">
        今月で終了する
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

// 定期取引の一覧と作成・編集・終了操作（owner/adminだけに操作を表示する）
export function RecurringManagement({ view }: RecurringManagementProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = view.recurringTransactions.find(
    (recurring) => recurring.id === editingId,
  );

  return (
    <div className={styles["recurring-layout"]}>
      <section className={styles["recurring-list-panel"]}>
        <h2>登録済みの定期取引</h2>
        {view.recurringTransactions.length === 0 ? (
          <p className={styles["recurring-empty"]}>
            家賃や給与のように毎月同じ日・同じ金額で発生する取引を登録すると、ホームカレンダーの対象月へ自動で反映されます。
          </p>
        ) : (
          <ul className={styles["recurring-list"]}>
            {view.recurringTransactions.map((recurring) => (
              <li
                className={`${styles["recurring-card"]} ${recurring.isEnded ? styles["is-ended"] : ""}`}
                key={recurring.id}
              >
                <div className={styles["recurring-card-heading"]}>
                  <span
                    className={`${styles["recurring-type"]} ${recurring.type === "income" ? styles["is-income"] : ""}`}
                  >
                    {recurring.type === "income" ? "収入" : "支出"}
                  </span>
                  <strong>{recurring.name}</strong>
                  {recurring.isEnded ? (
                    <span className={styles["recurring-ended-badge"]}>
                      終了
                    </span>
                  ) : null}
                </div>
                <ScheduleSummary
                  allocations={recurring.allocations}
                  amountMinor={recurring.amountMinor}
                  dayOfMonth={recurring.dayOfMonth}
                />
                <dl className={styles["recurring-meta"]}>
                  <div>
                    <dt>カテゴリ</dt>
                    <dd>{recurring.categoryName}</dd>
                  </div>
                  <div>
                    <dt>{recurring.type === "income" ? "受取者" : "支払者"}</dt>
                    <dd>{recurring.partyDisplayName}</dd>
                  </div>
                  <div>
                    <dt>期間</dt>
                    <dd>
                      {recurring.startMonth}〜{recurring.endMonth ?? "無期限"}
                    </dd>
                  </div>
                </dl>
                {view.canManage ? (
                  <div className={styles["recurring-card-actions"]}>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        setEditingId(
                          editingId === recurring.id ? null : recurring.id,
                        )
                      }
                      type="button"
                    >
                      {editingId === recurring.id ? "編集を閉じる" : "編集"}
                    </button>
                    {recurring.isEnded ? null : (
                      <EndRecurringForm recurring={recurring} view={view} />
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.canManage ? (
        <section className={styles["recurring-form-panel"]}>
          {editing ? (
            <EditRecurringForm
              key={editing.id}
              onClose={() => setEditingId(null)}
              recurring={editing}
              view={view}
            />
          ) : (
            <CreateRecurringForm view={view} />
          )}
        </section>
      ) : (
        <p className={styles["recurring-readonly"]}>
          定期取引の設定はオーナーと管理者が行います。
        </p>
      )}
    </div>
  );
}
