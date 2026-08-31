"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import type { TransactionEditTransaction } from "../application/edit-types";
import type {
  ExpenseFormCategory,
  ExpenseFormOptions,
} from "../application/expense-types";
import { calculateExpenseAllocations } from "../domain/expense-allocation";
import { INITIAL_EXPENSE_ACTION_STATE } from "./action-state";
import {
  createTransactionAction,
  updateExpenseAction,
  updateIncomeAction,
} from "./actions";

import styles from "./transactions.module.css";

type ExpenseFormProps = Readonly<{
  options: ExpenseFormOptions;
  /** 登録モードで使う二重送信防止ID（editと同時指定しない） */
  clientRequestId?: string;
  /** 編集モードの対象取引と検証済みの戻り先 */
  edit?: Readonly<{
    transaction: TransactionEditTransaction;
    returnTo: string;
  }>;
}>;

const yenFormatter = new Intl.NumberFormat("ja-JP");

// 送信中は無効化して二重送信を防ぐ保存ボタン
function SaveButton({
  label,
  disabled,
}: Readonly<{ label: string; disabled?: boolean }>) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`primary-button ${styles["expense-save-button"]}`}
      disabled={pending || disabled}
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
  transaction: TransactionEditTransaction | undefined,
): readonly string[] {
  if (transaction?.type !== "expense") {
    return [options.group.currentMembershipId];
  }
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

// 編集時は現在のカテゴリがアーカイブ済みでも選択肢へ残す（変更しない場合だけ保存できる）
function categoryChoicesFor(
  activeCategories: readonly ExpenseFormCategory[],
  transaction: TransactionEditTransaction | undefined,
): readonly ExpenseFormCategory[] {
  if (!transaction?.archivedCategory) return activeCategories;
  return [
    ...activeCategories,
    {
      id: transaction.archivedCategory.id,
      name: `${transaction.archivedCategory.name}（アーカイブ済み）`,
      color: transaction.archivedCategory.color,
      icon: "",
    },
  ];
}

// 支出・収入の登録・編集フォーム。種別切替と負担額のリアルタイムプレビューを備えるClient Component
export function ExpenseForm({
  options,
  clientRequestId,
  edit,
}: ExpenseFormProps) {
  const editTransaction = edit?.transaction;
  const expenseEdit =
    editTransaction?.type === "expense" ? editTransaction : undefined;
  const incomeEdit =
    editTransaction?.type === "income" ? editTransaction : undefined;

  // 登録時の種別は切替可能（初期は支出）。編集では保存済みの種別に固定する (AC-TXN-013-6)
  const [selectedType, setSelectedType] = useState<"expense" | "income">(
    "expense",
  );
  const transactionType = editTransaction?.type ?? selectedType;
  const isIncome = transactionType === "income";

  const boundAction = edit
    ? edit.transaction.type === "income"
      ? updateIncomeAction.bind(
          null,
          options.group.id,
          edit.transaction.id,
          edit.returnTo,
        )
      : updateExpenseAction.bind(
          null,
          options.group.id,
          edit.transaction.id,
          edit.returnTo,
        )
    : createTransactionAction.bind(null, options.group.id);
  const [state, action] = useActionState(
    boundAction,
    INITIAL_EXPENSE_ACTION_STATE,
  );
  const [amountMinor, setAmountMinor] = useState(
    editTransaction ? String(editTransaction.amountMinor) : "",
  );
  const [payerMemberId, setPayerMemberId] = useState(
    expenseEdit?.payerIsActive
      ? expenseEdit.payerMemberId
      : options.group.currentMembershipId,
  );
  const [recipientMemberId, setRecipientMemberId] = useState(
    incomeEdit?.recipientIsActive
      ? incomeEdit.recipientMemberId
      : options.group.currentMembershipId,
  );
  // 登録時の初期負担方法は常に「1人」(AC-TXN-001-10)、編集時は保存済み負担から復元する
  const [allocationMethod, setAllocationMethod] = useState<
    "equal" | "single" | "custom"
  >(expenseEdit?.allocationMethod ?? "single");
  const [selectedMemberIds, setSelectedMemberIds] = useState<readonly string[]>(
    () => initialSelectedMemberIds(options, editTransaction),
  );
  const [customAmounts, setCustomAmounts] = useState<
    Readonly<Record<string, string>>
  >(() =>
    expenseEdit
      ? Object.fromEntries(
          expenseEdit.allocations.map((allocation) => [
            allocation.memberId,
            String(allocation.amountMinor),
          ]),
        )
      : {},
  );

  // 削除済みメンバーが負担へ含まれる場合、そのままでは保存できないことを説明する
  const hasRemovedAllocationMember = Boolean(
    expenseEdit?.allocations.some(
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

  const categoryChoices = isIncome
    ? categoryChoicesFor(options.incomeCategories, incomeEdit)
    : categoryChoicesFor(options.categories, expenseEdit);
  const hasNoIncomeCategory = isIncome && categoryChoices.length === 0;

  // 入力中の値で負担配分を試算する確認用プレビュー（不成立の間はnull）
  const preview = useMemo(() => {
    if (isIncome) return null;
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
    isIncome,
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

      {!editTransaction && (
        <fieldset
          className={`${styles["allocation-fieldset"]} ${styles["type-fieldset"]}`}
        >
          <legend>種別</legend>
          <div className={styles["segmented-control"]}>
            {(
              [
                ["expense", "支出"],
                ["income", "収入"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  checked={selectedType === value}
                  name="transactionType"
                  onChange={() => setSelectedType(value)}
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
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
          <label htmlFor="transactionDate">
            {isIncome ? "受け取った日" : "使った日"}
          </label>
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
          {hasNoIncomeCategory ? (
            <p className={styles["edit-note"]}>
              アクティブな収入カテゴリがありません。カテゴリ管理で追加してから収入を登録してください。
            </p>
          ) : (
            <div className={styles["category-options"]} key={transactionType}>
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
                    <span className="category-option-name">
                      {category.name}
                    </span>
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
          )}
          {state.fieldErrors?.categoryId?.[0] && (
            <p className="field-error" id="categoryId-error">
              {state.fieldErrors.categoryId[0]}
            </p>
          )}
        </fieldset>

        {isIncome ? (
          <div className={styles["expense-field"]}>
            <label htmlFor="recipientMemberId">受け取った人</label>
            <select
              aria-describedby="recipientMemberId-error"
              id="recipientMemberId"
              name="recipientMemberId"
              onChange={(event) => setRecipientMemberId(event.target.value)}
              value={recipientMemberId}
            >
              {options.members.map((member) => (
                <option key={member.membershipId} value={member.membershipId}>
                  {member.displayName}
                  {member.isCurrentUser ? "（自分）" : ""}
                </option>
              ))}
            </select>
            {incomeEdit && !incomeEdit.recipientIsActive && (
              <p className={styles["edit-note"]}>
                これまでの受取者「{incomeEdit.recipientDisplayName}
                」はグループから外れています。アクティブメンバーへ変更しないと保存できません。
              </p>
            )}
            {state.fieldErrors?.recipientMemberId?.[0] && (
              <p className="field-error" id="recipientMemberId-error">
                {state.fieldErrors.recipientMemberId[0]}
              </p>
            )}
          </div>
        ) : (
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
            {expenseEdit && !expenseEdit.payerIsActive && (
              <p className={styles["edit-note"]}>
                これまでの支払者「{expenseEdit.payerDisplayName}
                」はグループから外れています。アクティブメンバーへ変更しないと保存できません。
              </p>
            )}
            {state.fieldErrors?.payerMemberId?.[0] && (
              <p className="field-error" id="payerMemberId-error">
                {state.fieldErrors.payerMemberId[0]}
              </p>
            )}
          </div>
        )}
      </div>

      {!isIncome && (
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
                      toggleEqualMember(
                        member.membershipId,
                        event.target.checked,
                      )
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
                value={
                  selectedMemberIds[0] ?? options.group.currentMembershipId
                }
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
            <p className="field-error">
              {state.fieldErrors.allocationMethod[0]}
            </p>
          )}
        </fieldset>
      )}

      {!isIncome && (
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
      )}

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
        <SaveButton
          disabled={hasNoIncomeCategory}
          label={
            editTransaction
              ? "変更を保存"
              : isIncome
                ? "収入を保存"
                : "支出を保存"
          }
        />
      </div>
    </form>
  );
}
