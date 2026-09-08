"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import type { TransactionEditTransaction } from "../application/edit-types";
import type {
  ExpenseFormCategory,
  ExpenseFormOptions,
} from "../application/expense-types";
import {
  type AmountEvaluationFailure,
  appendAmountDigit,
  appendAmountOperator,
  completeAmountExpression,
  evaluateAmountExpression,
  normalizeAmountInput,
  parseAmountExpression,
  removeLastAmountDigit,
} from "../domain/amount-keypad";
import { calculateExpenseAllocations } from "../domain/expense-allocation";
import { INITIAL_EXPENSE_ACTION_STATE } from "./action-state";
import {
  createTransactionAction,
  updateExpenseAction,
  updateIncomeAction,
} from "./actions";
import { AmountKeypad } from "./amount-keypad";

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
  /** フォーム直後へ描画する補助操作（削除など）。固定ドックの余白の内側へ含める (AC-TXN-009-5) */
  footer?: ReactNode;
}>;

const yenFormatter = new Intl.NumberFormat("ja-JP");

// 計算できない式の理由を金額欄の近くへ示す文言 (AC-TXN-017-4)
const CALCULATION_FAILURE_MESSAGES: Readonly<
  Record<AmountEvaluationFailure, string>
> = {
  negative: "0円未満にはできません",
  "divide-by-zero": "0で割ることはできません",
  overflow: "金額が上限を超えます",
};

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
  footer,
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
  // 金額欄は電卓の表示部で、式（例: 1200+300）を持つ。送信する金額は計算結果だけをhidden inputへ入れる (TXN-017)
  const [amountExpression, setAmountExpression] = useState(
    editTransaction ? String(editTransaction.amountMinor) : "",
  );
  const amountEvaluation = evaluateAmountExpression(amountExpression);
  const amountMinor = amountEvaluation.ok ? amountEvaluation.value : "";
  const parsedAmount = parseAmountExpression(amountExpression);
  // 右辺を入力している間だけ、保存時に使う計算結果か計算できない理由を示す (AC-TXN-017-3, AC-TXN-017-4)
  const showCalculation =
    parsedAmount.operator !== null && parsedAmount.right !== "";
  // 支払者は画面で選ばせず、編集時は保存済みの値、登録時・削除済み支払者は現在のメンバーを隠しfieldで送る (AC-TXN-018-1)
  const payerMemberId = expenseEdit?.payerIsActive
    ? expenseEdit.payerMemberId
    : options.group.currentMembershipId;
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

  // カテゴリ一覧の展開状態。既定は1行表示 (TXN-015)
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  // 金額欄を選ぶと開き、他の入力欄を選ぶと閉じる（OSの仮想キーボードに近い挙動）(AC-TXN-014-5)
  const [keypadOpen, setKeypadOpen] = useState(true);
  // 閉じるキーで金額欄へfocusを戻す間だけ、focusによる再開を抑止する (AC-TXN-014-8)
  const keepKeypadClosedRef = useRef(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    editTransaction?.categoryId ?? "",
  );
  const formRef = useRef<HTMLFormElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const categoryOptionsRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const amountFieldRef = useRef<HTMLDivElement>(null);

  // 削除済みメンバーが負担へ含まれる場合、そのままでは保存できないことを説明する
  const hasRemovedAllocationMember = Boolean(
    expenseEdit?.allocations.some(
      (allocation) =>
        !options.members.some(
          (member) => member.membershipId === allocation.memberId,
        ),
    ),
  );

  // 固定した入力ドックの見える高さぶんだけ外枠の下端を空け、最後の入力とfooterが隠れないようにする (AC-TXN-009-5)。
  // ドック下端のナビゲーション用paddingは共通layoutが確保済みのため差し引く。
  useEffect(() => {
    const dock = dockRef.current;
    const shell = shellRef.current;
    if (!dock || !shell || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const navReserve = Number.parseFloat(
        window.getComputedStyle(dock).paddingBottom,
      );
      const visibleHeight = dock.offsetHeight - (navReserve || 0);
      shell.style.setProperty("--input-dock-height", `${visibleHeight}px`);
      // footer側がドック上端を求めるため、ナビゲーション用paddingを含む全高も渡す
      shell.style.setProperty(
        "--input-dock-total-height",
        `${dock.offsetHeight}px`,
      );
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  // 折りたたみ表示でも選択中カテゴリが見えるよう、行内だけを横scrollする (AC-TXN-015-1)
  useEffect(() => {
    if (categoryExpanded) return;
    const container = categoryOptionsRef.current;
    const selected = container
      ?.querySelector<HTMLInputElement>('input[name="categoryId"]:checked')
      ?.closest("label");
    if (!container || !selected) return;
    container.scrollLeft =
      selected.offsetLeft - (container.clientWidth - selected.clientWidth) / 2;
  }, [categoryExpanded]);

  // カテゴリ展開中はカテゴリ一覧へ場所を譲り、折りたたみ中も数字キーを隠す (AC-TXN-014-5)
  const showKeypad = !categoryExpanded && keypadOpen;

  const categoryChoices = isIncome
    ? categoryChoicesFor(options.incomeCategories, incomeEdit)
    : categoryChoicesFor(options.categories, expenseEdit);
  const hasNoIncomeCategory = isIncome && categoryChoices.length === 0;
  // 選択中カテゴリが現在の選択肢に無ければ先頭へ戻す（種別切替時の整合）
  const effectiveCategoryId = categoryChoices.some(
    (category) => category.id === selectedCategoryId,
  )
    ? selectedCategoryId
    : (categoryChoices[0]?.id ?? "");

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

  // テンキーを開くとドックが高くなるため、金額欄（計算結果の行を含む）がドックへ隠れない位置まで移動する (AC-TXN-014-7, AC-TXN-017-3)
  // ドックが画面下端へ重なるのは狭い画面だけなので、PC幅では移動しない
  // biome-ignore lint/correctness/useExhaustiveDependencies: 計算結果の行の表示切替で金額欄の高さが変わるため再計算する
  useEffect(() => {
    if (!showKeypad) return;
    if (window.matchMedia?.("(min-width: 900px)").matches) return;
    // ドックの高さが確定してから、金額欄とドックの重なりぶんだけ動かす
    const frame = requestAnimationFrame(() => {
      const field = amountFieldRef.current;
      const dock = dockRef.current;
      if (!field || !dock) return;
      const overlap =
        field.getBoundingClientRect().bottom -
        dock.getBoundingClientRect().top +
        8;
      if (overlap > 0) window.scrollBy({ top: overlap });
    });
    return () => cancelAnimationFrame(frame);
  }, [showKeypad, showCalculation]);

  // 式が金額欄の幅を超えたとき、入力中の末尾が見えるよう表示位置を末尾へ寄せる (TXN-017)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 式が変わるたびに描画後の幅で末尾へ寄せる
  useEffect(() => {
    const input = amountInputRef.current;
    if (input) input.scrollLeft = input.scrollWidth;
  }, [amountExpression]);

  // 金額欄へfocusしたら開き、金額欄以外の入力欄へfocusしたら閉じる。
  // 入力ドック内（カテゴリ・キー・保存）の操作では開閉状態を変えない (AC-TXN-014-5)
  function handleFormFocus(event: ReactFocusEvent<HTMLFormElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target === amountInputRef.current) {
      if (!keepKeypadClosedRef.current) setKeypadOpen(true);
      return;
    }
    if (dockRef.current?.contains(target)) return;
    setKeypadOpen(false);
  }

  // 閉じるキーで閉じたあと、消えたキーからfocusを金額欄へ戻す。金額欄の再開案内が読み上げられ、
  // Tabで次の入力欄へ進める。focusイベントは同期的に届くため、抑止は同じ処理内で解除する (AC-TXN-014-8)
  function closeKeypad() {
    setKeypadOpen(false);
    const input = amountInputRef.current;
    if (!input) return;
    keepKeypadClosedRef.current = true;
    try {
      input.focus({ preventScroll: true });
    } finally {
      keepKeypadClosedRef.current = false;
    }
  }

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
    <div className={styles["expense-form-shell"]} ref={shellRef}>
      <form
        action={action}
        className={styles["expense-form"]}
        noValidate
        onFocus={handleFormFocus}
        ref={formRef}
      >
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

        {/* 金額はドックのテンキーで入力する。inputmode="none"でOSの仮想キーボードを開かず、
          物理キーボードとスクリーンリーダーからの入力は維持する (TXN-014) */}
        <div
          className={`${styles["expense-field"]} ${styles["amount-field"]}`}
          ref={amountFieldRef}
        >
          <label htmlFor="amountMinor">金額</label>
          {/* 送信する金額は式の計算結果だけ。表示用の欄はnameを持たせずFormDataへ含めない (AC-TXN-017-3) */}
          <input name="amountMinor" type="hidden" value={amountMinor} />
          <div
            className={styles["amount-input-wrap"]}
            data-long={amountExpression.length >= 8 ? "true" : undefined}
          >
            <span aria-hidden="true">¥</span>
            <input
              aria-describedby={[
                "amountMinor-error",
                showCalculation && "amountMinor-calculation",
                !keypadOpen && "amountMinor-keypad-hint",
              ]
                .filter(Boolean)
                .join(" ")}
              autoComplete="off"
              id="amountMinor"
              inputMode="none"
              onChange={(event) =>
                setAmountExpression(normalizeAmountInput(event.target.value))
              }
              onClick={() => setKeypadOpen(true)}
              placeholder="0"
              ref={amountInputRef}
              value={amountExpression}
            />
          </div>
          {showCalculation && (
            <p
              aria-live="polite"
              className={styles["amount-calculation"]}
              data-invalid={amountEvaluation.ok ? undefined : "true"}
              id="amountMinor-calculation"
            >
              {amountEvaluation.ok
                ? `= ¥${yenFormatter.format(Number(amountEvaluation.value || 0))}`
                : CALCULATION_FAILURE_MESSAGES[amountEvaluation.reason]}
            </p>
          )}
          {/* 閉じている間の再開手段を画面上へ示す (AC-TXN-014-6) */}
          {!keypadOpen && (
            <p className={styles["keypad-hint"]} id="amountMinor-keypad-hint">
              金額欄をタップするとテンキーを開きます。
            </p>
          )}
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
            <>
              {/* 支払者は表示せず自動設定する。Server Actionの検証はそのまま通す (TXN-018) */}
              <input name="payerMemberId" type="hidden" value={payerMemberId} />
              {state.fieldErrors?.payerMemberId?.[0] && (
                <p className="field-error" id="payerMemberId-error">
                  {state.fieldErrors.payerMemberId[0]}
                </p>
              )}
            </>
          )}
        </div>

        {!isIncome && (
          <fieldset className={styles["allocation-fieldset"]}>
            <legend>分け方</legend>
            {hasRemovedAllocationMember && (
              <p className={styles["edit-note"]}>
                保存済みの内訳にグループから外れたメンバーが含まれています。アクティブメンバーだけで内訳を設定し直してください。
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
                <label htmlFor="singleMemberId">支出した人</label>
                <select
                  id="singleMemberId"
                  name="selectedMemberIds"
                  onChange={(event) =>
                    setSelectedMemberIds([event.target.value])
                  }
                  value={
                    selectedMemberIds[0] ?? options.group.currentMembershipId
                  }
                >
                  {options.members.map((member) => (
                    <option
                      key={member.membershipId}
                      value={member.membershipId}
                    >
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
            <h2>内訳の確認</h2>
            {preview ? (
              <dl>
                {preview.map((allocation) => {
                  const member = options.members.find(
                    (candidate) =>
                      candidate.membershipId === allocation.memberId,
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
              <p>金額と分け方を入力すると、ここに内訳を表示します。</p>
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

        {/* カテゴリ・テンキー・保存を画面下部のドックへ固定し、金額入力中も隠れないようにする */}
        <div
          className={styles["input-dock"]}
          data-category-expanded={categoryExpanded}
          data-keypad-open={showKeypad}
          ref={dockRef}
        >
          {/* テンキーを開いている間だけ、ドック右上（「すべて」の真上）に閉じる操作を置く (AC-TXN-014-8, AC-TXN-014-9) */}
          {showKeypad && (
            <button
              aria-label="テンキーを閉じる"
              className={styles["keypad-close"]}
              onClick={closeKeypad}
              type="button"
            >
              閉じる
            </button>
          )}
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
              <div className={styles["category-select"]}>
                <div
                  className={styles["category-options"]}
                  ref={categoryOptionsRef}
                >
                  {categoryChoices.map((category) => (
                    <label
                      className={styles["category-option"]}
                      key={category.id}
                    >
                      <input
                        checked={category.id === effectiveCategoryId}
                        name="categoryId"
                        onChange={() => {
                          setSelectedCategoryId(category.id);
                          setCategoryExpanded(false);
                        }}
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
                <button
                  aria-expanded={categoryExpanded}
                  className={styles["category-expand-toggle"]}
                  onClick={() => setCategoryExpanded((current) => !current)}
                  type="button"
                >
                  {categoryExpanded ? "閉じる" : "すべて"}
                </button>
              </div>
            )}
            {state.fieldErrors?.categoryId?.[0] && (
              <p className="field-error" id="categoryId-error">
                {state.fieldErrors.categoryId[0]}
              </p>
            )}
          </fieldset>

          {/* 保存は常設し、数字・演算子キーと1文字削除・=だけを開閉する (AC-TXN-014-5, AC-TXN-016-1, TXN-017) */}
          <AmountKeypad
            calculator={{
              onOperator: (operator) =>
                setAmountExpression((current) =>
                  appendAmountOperator(current, operator),
                ),
              onEquals: () => setAmountExpression(completeAmountExpression),
            }}
            onDelete={() => setAmountExpression(removeLastAmountDigit)}
            onKey={(key) =>
              setAmountExpression((current) => appendAmountDigit(current, key))
            }
            open={showKeypad}
            side={
              <div className={styles["input-dock-save"]}>
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
            }
          />
        </div>
      </form>
      {footer}
    </div>
  );
}
