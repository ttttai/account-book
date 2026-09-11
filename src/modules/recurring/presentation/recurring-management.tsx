"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
} from "react";
import { useFormStatus } from "react-dom";

import {
  appendAmountDigit,
  formatAmountExpression,
  removeLastAmountDigit,
  stripAmountGrouping,
} from "@/modules/transactions";
import { AmountKeypad } from "@/modules/transactions/presentation";

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

// 作成・編集で共通の入力欄。種別で受取者と分け方の表示を切り替える。支出の支払者は表示せず自動設定する (TXN-018)
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
  // 支出の支払者は画面に出さない。保存済みの支払者が候補に無ければ現在のメンバーへ置き換える (AC-TXN-018-1)
  const currentMembershipId = view.members.find(
    (member) => member.isCurrentUser,
  )?.membershipId;
  const hiddenPayerMemberId =
    recurring?.type === "expense" &&
    view.members.some(
      (member) => member.membershipId === recurring.partyMembershipId,
    )
      ? recurring.partyMembershipId
      : (currentMembershipId ?? "");

  // 金額は取引入力と同じ画面内テンキーで入力する。OSの仮想キーボードを開かず、下部ナビゲーションを押し上げない (REC-010)
  const [amountMinor, setAmountMinor] = useState(
    recurring ? String(recurring.amountMinor) : "",
  );
  const [keypadOpen, setKeypadOpen] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const keypadRef = useRef<HTMLDivElement>(null);

  // 金額欄へfocusしたら開き、金額欄以外の入力欄へfocusしたら閉じる。テンキー内の操作では開閉しない (AC-REC-005-2)
  function handleFieldsFocus(event: ReactFocusEvent<HTMLFieldSetElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target === amountInputRef.current) {
      setKeypadOpen(true);
      return;
    }
    if (keypadRef.current?.contains(target)) return;
    setKeypadOpen(false);
  }

  // 開いたテンキーが下部ナビゲーションへ隠れないよう、scroll-margin込みで見える位置まで移動する (AC-REC-005-4)
  useEffect(() => {
    if (!keypadOpen) return;
    const frame = requestAnimationFrame(() => {
      const keypad = keypadRef.current;
      if (keypad && typeof keypad.scrollIntoView === "function") {
        keypad.scrollIntoView({ block: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [keypadOpen]);

  return (
    <fieldset
      className={styles["recurring-fields"]}
      onFocus={handleFieldsFocus}
    >
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

      {/* inputmode="none"でOSの仮想キーボードを開かず、物理キーボードとスクリーンリーダーからの入力は維持する (AC-REC-005-1, AC-REC-005-3) */}
      <div className={styles["recurring-field"]}>
        <label htmlFor={`${fieldId}-amount`}>金額</label>
        {/* 送信値は区切りなしの整数のままhidden inputで送り、表示用の金額欄だけを3桁区切りにする (AC-REC-005-5) */}
        <input name="amountMinor" type="hidden" value={amountMinor} />
        <div className={styles["recurring-amount-wrap"]}>
          <span aria-hidden="true">¥</span>
          <input
            aria-describedby={
              keypadOpen ? undefined : `${fieldId}-amount-keypad-hint`
            }
            autoComplete="off"
            id={`${fieldId}-amount`}
            inputMode="none"
            onChange={(event) =>
              setAmountMinor(stripAmountGrouping(event.target.value))
            }
            onClick={() => setKeypadOpen(true)}
            pattern="[0-9,]*"
            placeholder="0"
            ref={amountInputRef}
            required
            type="text"
            value={formatAmountExpression(amountMinor)}
          />
        </div>
        {keypadOpen ? (
          <AmountKeypad
            className={styles["recurring-keypad"]}
            onDelete={() => setAmountMinor(removeLastAmountDigit)}
            onKey={(key) =>
              setAmountMinor((current) => appendAmountDigit(current, key))
            }
            open
            ref={keypadRef}
          />
        ) : (
          <p
            className={styles["recurring-keypad-hint"]}
            id={`${fieldId}-amount-keypad-hint`}
          >
            金額欄をタップするとテンキーを開きます。
          </p>
        )}
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

      {type === "income" ? (
        <div className={styles["recurring-field"]}>
          <label htmlFor={`${fieldId}-party`}>受け取る人</label>
          <select
            defaultValue={
              recurring?.partyMembershipId ??
              view.members.find((member) => member.isCurrentUser)
                ?.membershipId ??
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
      ) : (
        <>
          {/* 支出の支払者は表示せず、保存済みの値（アクティブでなければ現在のメンバー）を送る (AC-TXN-018-1) */}
          <input
            name="partyMemberId"
            type="hidden"
            value={hiddenPayerMemberId}
          />
          {fieldErrors.partyMemberId ? (
            <p className="field-error">{fieldErrors.partyMemberId.join(" ")}</p>
          ) : null}
        </>
      )}

      {type === "expense" ? (
        <fieldset className={styles["recurring-fieldset"]}>
          <legend>分け方</legend>
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
    </fieldset>
  );
}

function CreateRecurringForm({ view }: RecurringManagementProps) {
  const [state, formAction] = useActionState(
    createRecurringAction.bind(null, view.group.id),
    initialRecurringActionState,
  );

  return (
    <form action={formAction} className={styles["recurring-form"]}>
      <h2>固定費を追加</h2>
      <RecurringFormFields state={state} view={view} />
      <ActionMessage state={state} />
      <SaveButton label="固定費を保存" />
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

// 固定費の一覧と作成・編集・終了操作（owner/adminだけに操作を表示する）
export function RecurringManagement({ view }: RecurringManagementProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = view.recurringTransactions.find(
    (recurring) => recurring.id === editingId,
  );

  return (
    <div className={styles["recurring-layout"]}>
      <section className={styles["recurring-list-panel"]}>
        <h2>登録済みの固定費</h2>
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
                  {/* 支出の支払者は一覧にも出さない (AC-TXN-018-3) */}
                  {recurring.type === "income" ? (
                    <div>
                      <dt>受取者</dt>
                      <dd>{recurring.partyDisplayName}</dd>
                    </div>
                  ) : null}
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
          固定費の設定はオーナーと管理者が行います。
        </p>
      )}
    </div>
  );
}
