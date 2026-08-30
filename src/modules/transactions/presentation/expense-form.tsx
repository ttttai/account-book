"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import type { ExpenseEditTransaction } from "../application/edit-types";
import type { ExpenseFormOptions } from "../application/expense-types";
import { calculateExpenseAllocations } from "../domain/expense-allocation";
import { INITIAL_EXPENSE_ACTION_STATE } from "./action-state";
import { createExpenseAction, updateExpenseAction } from "./actions";

import styles from "./transactions.module.css";

type ExpenseFormProps = Readonly<{
  options: ExpenseFormOptions;
  /** 登録モードで使う二重送信防止ID（editと同時指定しない） */
  clientRequestId?: string;
  /** 編集モードの対象取引と検証済みの戻り先 */
  edit?: Readonly<{
    transaction: ExpenseEditTransaction;
    returnTo: string;
  }>;
}>;

const yenFormatter = new Intl.NumberFormat("ja-JP");

// 送信中は無効化して二重送信を防ぐ保存ボタン
function SaveButton({ label }: Readonly<{ label: string }>) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`primary-button ${styles["expense-save-button"]}`}
      disabled={pending}
      type="submit"
    >
      {pending ? "保存中…" : label}
    </button>
  );
}

// 入力文字列を1以上の安全な整数として解釈する（不正な間はnull）
function safeAmount(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

// 前回選択した支払者をlocalStorageから読み出す
function readLastPayer(groupId: string): string | null {
  try {
    return window.localStorage.getItem(`account-book:last-payer:${groupId}`);
  } catch {
    return null;
  }
}

function saveLastPayer(groupId: string, memberId: string): void {
  try {
    window.localStorage.setItem(`account-book:last-payer:${groupId}`, memberId);
  } catch {
    // 前回値の保存は任意機能なので、利用できない環境でも入力を継続する。
  }
}

// 保存済みの選択メンバーから、編集フォームの初期選択を負担方法別に組み立てる
function initialSelectedMemberIds(
  options: ExpenseFormOptions,
  transaction: ExpenseEditTransaction | undefined,
): readonly string[] {
  if (!transaction) return [options.group.currentMembershipId];
  const activeMemberIds = new Set(
    options.members.map((member) => member.membershipId),
  );
  const savedActiveIds = transaction.allocations
    .map((allocation) => allocation.memberId)
    .filter((memberId) => activeMemberIds.has(memberId));
  if (transaction.allocationMethod === "single") {
    return savedActiveIds.length === 1
      ? savedActiveIds
      : [options.group.currentMembershipId];
  }
  return savedActiveIds.length > 0
    ? savedActiveIds
    : [options.group.currentMembershipId];
}

// 支出の登録・編集フォーム。負担方法の切り替えと負担額のリアルタイムプレビューを備えるClient Component
export function ExpenseForm({
  options,
  clientRequestId,
  edit,
}: ExpenseFormProps) {
  const editTransaction = edit?.transaction;
  const boundAction = edit
    ? updateExpenseAction.bind(
        null,
        options.group.id,
        edit.transaction.id,
        edit.returnTo,
      )
    : createExpenseAction.bind(null, options.group.id);
  const [state, action] = useActionState(
    boundAction,
    INITIAL_EXPENSE_ACTION_STATE,
  );
  const [amountMinor, setAmountMinor] = useState(
    editTransaction ? String(editTransaction.amountMinor) : "",
  );
  const [payerMemberId, setPayerMemberId] = useState(
    editTransaction?.payerIsActive
      ? editTransaction.payerMemberId
      : options.group.currentMembershipId,
  );
  // 登録時の初期負担方法は常に「1人」(AC-TXN-001-10)、編集時は保存済み負担から復元する
  const [allocationMethod, setAllocationMethod] = useState<
    "equal" | "single" | "custom"
  >(editTransaction?.allocationMethod ?? "single");
  const [selectedMemberIds, setSelectedMemberIds] = useState<readonly string[]>(
    () => initialSelectedMemberIds(options, editTransaction),
  );
  const [customAmounts, setCustomAmounts] = useState<
    Readonly<Record<string, string>>
  >(() =>
    editTransaction
      ? Object.fromEntries(
          editTransaction.allocations.map((allocation) => [
            allocation.memberId,
            String(allocation.amountMinor),
          ]),
        )
      : {},
  );

  // 削除済みメンバーが負担へ含まれる場合、そのままでは保存できないことを説明する
  const hasRemovedAllocationMember = Boolean(
    editTransaction?.allocations.some(
      (allocation) =>
        !options.members.some(
          (member) => member.membershipId === allocation.memberId,
        ),
    ),
  );

  // 前回の支払者が現メンバーに含まれていれば初期選択へ反映する（登録時のみ）
  useEffect(() => {
    if (editTransaction) return;
    const storedMemberId = readLastPayer(options.group.id);
    if (
      storedMemberId &&
      options.members.some((member) => member.membershipId === storedMemberId)
    ) {
      setPayerMemberId(storedMemberId);
    }
  }, [editTransaction, options.group.id, options.members]);

  // 編集時は現在のカテゴリがアーカイブ済みでも選択肢へ残す（変更しない場合だけ保存できる）
  const categoryChoices = editTransaction?.archivedCategory
    ? [
        ...options.categories,
        {
          id: editTransaction.archivedCategory.id,
          name: `${editTransaction.archivedCategory.name}（アーカイブ済み）`,
          color: editTransaction.archivedCategory.color,
          icon: "",
        },
      ]
    : options.categories;

  // 入力中の値で負担配分を試算する確認用プレビュー（不成立の間はnull）
  const preview = useMemo(() => {
    const amount = safeAmount(amountMinor);
    if (amount === null) return null;
    try {
      return calculateExpenseAllocations({
        method: allocationMethod,
        amountMinor: amount,
        selectedMemberIds,
        customAllocations: options.members.map((member) => ({
          memberId: member.membershipId,
          amountMinor: Number(customAmounts[member.membershipId] || 0),
        })),
      });
    } catch {
      return null;
    }
  }, [
    allocationMethod,
    amountMinor,
    customAmounts,
    options.members,
    selectedMemberIds,
  ]);

  // 負担方法の切り替え時に、選択メンバーを方法ごとの妥当な初期値へ整える
  function chooseAllocationMethod(method: "equal" | "single" | "custom") {
    setAllocationMethod(method);
    // 均等へ切り替えた時点で複数選択を調整していなければ、全アクティブメンバーを選択する
    if (method === "equal" && selectedMemberIds.length <= 1) {
      setSelectedMemberIds(
        options.members.map((member) => member.membershipId),
      );
    }
    if (method === "single" && selectedMemberIds.length !== 1) {
      setSelectedMemberIds([options.group.currentMembershipId]);
    }
  }

  function toggleEqualMember(memberId: string, checked: boolean) {
    setSelectedMemberIds((current) =>
      checked
        ? [...new Set([...current, memberId])]
        : current.filter((candidate) => candidate !== memberId),
    );
  }

  return (
    <form action={action} className={styles["expense-form"]} noValidate>
      {editTransaction ? (
        <input
          name="expectedVersion"
          type="hidden"
          value={editTransaction.version}
        />
      ) : (
        <input name="clientRequestId" type="hidden" value={clientRequestId} />
      )}

      <div className={`${styles["expense-field"]} ${styles["amount-field"]}`}>
        <label htmlFor="amountMinor">金額</label>
        <div className={styles["amount-input-wrap"]}>
          <span aria-hidden="true">¥</span>
          <input
            aria-describedby="amountMinor-error"
            autoComplete="off"
            id="amountMinor"
            inputMode="numeric"
            max="9007199254740991"
            name="amountMinor"
            onChange={(event) => setAmountMinor(event.target.value)}
            pattern="[0-9]*"
            placeholder="0"
            value={amountMinor}
          />
        </div>
        {state.fieldErrors?.amountMinor?.[0] && (
          <p className="field-error" id="amountMinor-error">
            {state.fieldErrors.amountMinor[0]}
          </p>
        )}
      </div>

      <div className={styles["expense-form-grid"]}>
        <div className={styles["expense-field"]}>
          <label htmlFor="transactionDate">使った日</label>
          <input
            aria-describedby="transactionDate-error"
            defaultValue={editTransaction?.transactionDate ?? options.today}
            id="transactionDate"
            name="transactionDate"
            type="date"
          />
          {state.fieldErrors?.transactionDate?.[0] && (
            <p className="field-error" id="transactionDate-error">
              {state.fieldErrors.transactionDate[0]}
            </p>
          )}
        </div>

        <fieldset
          aria-describedby="categoryId-error"
          className={styles["category-fieldset"]}
        >
          <legend>カテゴリ</legend>
          <div className={styles["category-options"]}>
            {categoryChoices.map((category, index) => (
              <label className={styles["category-option"]} key={category.id}>
                <input
                  defaultChecked={
                    editTransaction
                      ? category.id === editTransaction.categoryId
                      : index === 0
                  }
                  name="categoryId"
                  required
                  type="radio"
                  value={category.id}
                />
                <span className={styles["category-option-content"]}>
                  <span
                    aria-hidden="true"
                    className={styles["category-option-dot"]}
                    data-category-color={category.color}
                  />
                  <span className="category-option-name">{category.name}</span>
                  <span
                    aria-hidden="true"
                    className={styles["category-option-check"]}
                  >
                    ✓
                  </span>
                </span>
              </label>
            ))}
          </div>
          {state.fieldErrors?.categoryId?.[0] && (
            <p className="field-error" id="categoryId-error">
              {state.fieldErrors.categoryId[0]}
            </p>
          )}
        </fieldset>

        <div className={styles["expense-field"]}>
          <label htmlFor="payerMemberId">支払った人</label>
          <select
            aria-describedby="payerMemberId-error"
            id="payerMemberId"
            name="payerMemberId"
            onChange={(event) => {
              const memberId = event.target.value;
              setPayerMemberId(memberId);
              saveLastPayer(options.group.id, memberId);
            }}
            value={payerMemberId}
          >
            {options.members.map((member) => (
              <option key={member.membershipId} value={member.membershipId}>
                {member.displayName}
                {member.isCurrentUser ? "（自分）" : ""}
              </option>
            ))}
          </select>
          {editTransaction && !editTransaction.payerIsActive && (
            <p className={styles["edit-note"]}>
              これまでの支払者「{editTransaction.payerDisplayName}
              」はグループから外れています。アクティブメンバーへ変更しないと保存できません。
            </p>
          )}
          {state.fieldErrors?.payerMemberId?.[0] && (
            <p className="field-error" id="payerMemberId-error">
              {state.fieldErrors.payerMemberId[0]}
            </p>
          )}
        </div>
      </div>

      <fieldset className={styles["allocation-fieldset"]}>
        <legend>負担方法</legend>
        {hasRemovedAllocationMember && (
          <p className={styles["edit-note"]}>
            保存済みの負担にグループから外れたメンバーが含まれています。アクティブメンバーだけで負担を設定し直してください。
          </p>
        )}
        <div className={styles["segmented-control"]}>
          {(
            [
              ["single", "1人"],
              ["equal", "均等"],
              ["custom", "カスタム"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                checked={allocationMethod === value}
                name="allocationMethod"
                onChange={() => chooseAllocationMethod(value)}
                type="radio"
                value={value}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {allocationMethod === "equal" && (
          <div className={styles["allocation-members"]}>
            {options.members.map((member) => (
              <label
                className={styles["check-option"]}
                key={member.membershipId}
              >
                <input
                  checked={selectedMemberIds.includes(member.membershipId)}
                  name="selectedMemberIds"
                  onChange={(event) =>
                    toggleEqualMember(member.membershipId, event.target.checked)
                  }
                  type="checkbox"
                  value={member.membershipId}
                />
                {member.displayName}
                {member.isCurrentUser ? "（自分）" : ""}
              </label>
            ))}
          </div>
        )}

        {allocationMethod === "single" && (
          <div className={`${styles["expense-field"]} allocation-single`}>
            <label htmlFor="singleMemberId">負担する人</label>
            <select
              id="singleMemberId"
              name="selectedMemberIds"
              onChange={(event) => setSelectedMemberIds([event.target.value])}
              value={selectedMemberIds[0] ?? options.group.currentMembershipId}
            >
              {options.members.map((member) => (
                <option key={member.membershipId} value={member.membershipId}>
                  {member.displayName}
                  {member.isCurrentUser ? "（自分）" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {allocationMethod === "custom" && (
          <div className={styles["custom-allocation-list"]}>
            {options.members.map((member) => (
              <label key={member.membershipId}>
                <span>
                  {member.displayName}
                  {member.isCurrentUser ? "（自分）" : ""}
                </span>
                <span className={styles["custom-amount-wrap"]}>
                  <span aria-hidden="true">¥</span>
                  <input
                    inputMode="numeric"
                    name={`customAmount:${member.membershipId}`}
                    onChange={(event) =>
                      setCustomAmounts((current) => ({
                        ...current,
                        [member.membershipId]: event.target.value,
                      }))
                    }
                    pattern="[0-9]*"
                    placeholder="0"
                    value={customAmounts[member.membershipId] ?? ""}
                  />
                </span>
              </label>
            ))}
          </div>
        )}

        {state.fieldErrors?.allocationMethod?.[0] && (
          <p className="field-error">{state.fieldErrors.allocationMethod[0]}</p>
        )}
      </fieldset>

      <section className={styles["allocation-preview"]} aria-live="polite">
        <h2>負担額の確認</h2>
        {preview ? (
          <dl>
            {preview.map((allocation) => {
              const member = options.members.find(
                (candidate) => candidate.membershipId === allocation.memberId,
              );
              return (
                <div key={allocation.memberId}>
                  <dt>{member?.displayName ?? "メンバー"}</dt>
                  <dd>¥{yenFormatter.format(allocation.amountMinor)}</dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p>金額と負担方法を入力すると、ここに内訳を表示します。</p>
        )}
      </section>

      <div className={styles["expense-field"]}>
        <label htmlFor="memo">メモ（任意）</label>
        <textarea
          aria-describedby="memo-error"
          defaultValue={editTransaction?.memo ?? undefined}
          id="memo"
          maxLength={500}
          name="memo"
          rows={3}
        />
        {state.fieldErrors?.memo?.[0] && (
          <p className="field-error" id="memo-error">
            {state.fieldErrors.memo[0]}
          </p>
        )}
      </div>

      {state.message && (
        <p className="form-message error" role="alert">
          {state.message}
        </p>
      )}
      <div className={styles["expense-submit-bar"]}>
        <SaveButton label={editTransaction ? "変更を保存" : "支出を保存"} />
      </div>
    </form>
  );
}
