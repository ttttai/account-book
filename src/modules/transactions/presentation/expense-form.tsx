"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import type { ExpenseFormOptions } from "../application/expense-types";
import { calculateExpenseAllocations } from "../domain/expense-allocation";
import { INITIAL_EXPENSE_ACTION_STATE } from "./action-state";
import { createExpenseAction } from "./actions";

type ExpenseFormProps = Readonly<{
  options: ExpenseFormOptions;
  clientRequestId: string;
}>;

const yenFormatter = new Intl.NumberFormat("ja-JP");

// 送信中は無効化して二重送信を防ぐ保存ボタン
function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="primary-button expense-save-button"
      disabled={pending}
      type="submit"
    >
      {pending ? "保存中…" : "支出を保存"}
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

// 支出登録フォーム。負担方法の切り替えと負担額のリアルタイムプレビューを備えるClient Component
export function ExpenseForm({ options, clientRequestId }: ExpenseFormProps) {
  const actionWithGroup = createExpenseAction.bind(null, options.group.id);
  const [state, action] = useActionState(
    actionWithGroup,
    INITIAL_EXPENSE_ACTION_STATE,
  );
  const defaultMemberIds =
    options.group.defaultAllocation === "equal"
      ? options.members.map((member) => member.membershipId)
      : [options.group.currentMembershipId];
  const [amountMinor, setAmountMinor] = useState("");
  const [payerMemberId, setPayerMemberId] = useState(
    options.group.currentMembershipId,
  );
  const [allocationMethod, setAllocationMethod] = useState<
    "equal" | "single" | "custom"
  >(options.group.defaultAllocation === "equal" ? "equal" : "single");
  const [selectedMemberIds, setSelectedMemberIds] =
    useState<readonly string[]>(defaultMemberIds);
  const [customAmounts, setCustomAmounts] = useState<
    Readonly<Record<string, string>>
  >({});

  // 前回の支払者が現メンバーに含まれていれば初期選択へ反映する
  useEffect(() => {
    const storedMemberId = readLastPayer(options.group.id);
    if (
      storedMemberId &&
      options.members.some((member) => member.membershipId === storedMemberId)
    ) {
      setPayerMemberId(storedMemberId);
    }
  }, [options.group.id, options.members]);

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
    if (method === "equal" && selectedMemberIds.length === 0) {
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
    <form action={action} className="expense-form" noValidate>
      <input name="clientRequestId" type="hidden" value={clientRequestId} />

      <div className="expense-field amount-field">
        <label htmlFor="amountMinor">金額</label>
        <div className="amount-input-wrap">
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

      <div className="expense-form-grid">
        <div className="expense-field">
          <label htmlFor="transactionDate">使った日</label>
          <input
            aria-describedby="transactionDate-error"
            defaultValue={options.today}
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
          className="category-fieldset"
        >
          <legend>カテゴリ</legend>
          <div className="category-options">
            {options.categories.map((category, index) => (
              <label className="category-option" key={category.id}>
                <input
                  defaultChecked={index === 0}
                  name="categoryId"
                  required
                  type="radio"
                  value={category.id}
                />
                <span className="category-option-content">
                  <span
                    aria-hidden="true"
                    className="category-option-dot"
                    data-category-color={category.color}
                  />
                  <span className="category-option-name">{category.name}</span>
                  <span aria-hidden="true" className="category-option-check">
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

        <div className="expense-field">
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
          {state.fieldErrors?.payerMemberId?.[0] && (
            <p className="field-error" id="payerMemberId-error">
              {state.fieldErrors.payerMemberId[0]}
            </p>
          )}
        </div>
      </div>

      <fieldset className="allocation-fieldset">
        <legend>負担方法</legend>
        <div className="segmented-control">
          {(
            [
              ["equal", "均等"],
              ["single", "1人"],
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
          <div className="allocation-members">
            {options.members.map((member) => (
              <label className="check-option" key={member.membershipId}>
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
          <div className="expense-field allocation-single">
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
          <div className="custom-allocation-list">
            {options.members.map((member) => (
              <label key={member.membershipId}>
                <span>
                  {member.displayName}
                  {member.isCurrentUser ? "（自分）" : ""}
                </span>
                <span className="custom-amount-wrap">
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

      <section className="allocation-preview" aria-live="polite">
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

      <div className="expense-field">
        <label htmlFor="memo">メモ（任意）</label>
        <textarea
          aria-describedby="memo-error"
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
      <div className="expense-submit-bar">
        <SaveButton />
      </div>
    </form>
  );
}
