import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createExpense: vi.fn(),
  createIncome: vi.fn(),
  updateExpense: vi.fn(),
  updateIncome: vi.fn(),
  deleteTransaction: vi.fn(),
  loadTransactionSaveFeedback: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../application/create-expense", () => ({
  createExpense: mocks.createExpense,
}));
vi.mock("../application/create-income", () => ({
  createIncome: mocks.createIncome,
}));
vi.mock("../application/update-expense", () => ({
  updateExpense: mocks.updateExpense,
}));
vi.mock("../application/update-income", () => ({
  updateIncome: mocks.updateIncome,
}));
vi.mock("../application/delete-transaction", () => ({
  deleteTransaction: mocks.deleteTransaction,
}));
vi.mock("../application/load-transaction-save-feedback", () => ({
  loadTransactionSaveFeedback: mocks.loadTransactionSaveFeedback,
}));

import { INITIAL_EXPENSE_ACTION_STATE } from "./action-state";
import {
  createExpenseAction,
  createIncomeAction,
  deleteTransactionAction,
  updateExpenseAction,
  updateIncomeAction,
} from "./actions";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "20000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";
const MEMBER_ID = "40000000-0000-4000-8000-000000000001";
const REQUEST_ID = "50000000-0000-4000-8000-000000000001";

const feedback = {
  title: "支出を登録しました",
  description: "9/19 食費 ￥1,200",
};

function expenseFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values: Record<string, string> = {
    amountMinor: "1200",
    transactionDate: "2026-09-19",
    categoryId: CATEGORY_ID,
    payerMemberId: MEMBER_ID,
    allocationMethod: "single",
    memo: "",
    clientRequestId: REQUEST_ID,
    expectedVersion: "1",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  formData.append("selectedMemberIds", MEMBER_ID);
  return formData;
}

function incomeFormData(): FormData {
  const formData = new FormData();
  formData.set("amountMinor", "300000");
  formData.set("transactionDate", "2026-09-19");
  formData.set("categoryId", CATEGORY_ID);
  formData.set("recipientMemberId", MEMBER_ID);
  formData.set("memo", "");
  formData.set("clientRequestId", REQUEST_ID);
  formData.set("expectedVersion", "2");
  return formData;
}

describe("取引Server Actionの成功結果 (TXN-019, AC-TXN-019-1〜3)", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("支出登録はredirectせず、グループホームと通知内容を成功結果として返す", async () => {
    mocks.createExpense.mockResolvedValue(TRANSACTION_ID);
    mocks.loadTransactionSaveFeedback.mockResolvedValue(feedback);

    const state = await createExpenseAction(
      GROUP_ID,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData(),
    );

    expect(state).toEqual({
      status: "success",
      success: { redirectTo: `/groups/${GROUP_ID}`, feedback },
    });
    // 通知内容は保存済みの行（作成された取引ID）から組み立てる
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenCalledWith({
      operation: "create",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
      fallbackType: "expense",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/groups/${GROUP_ID}`);
  });

  it("収入登録も同じ形の成功結果を返し、未使用の?created=を付けない", async () => {
    mocks.createIncome.mockResolvedValue(TRANSACTION_ID);
    mocks.loadTransactionSaveFeedback.mockResolvedValue({
      title: "収入を登録しました",
    });

    const state = await createIncomeAction(
      GROUP_ID,
      INITIAL_EXPENSE_ACTION_STATE,
      incomeFormData(),
    );

    expect(state.status).toBe("success");
    expect(state.success?.redirectTo).toBe(`/groups/${GROUP_ID}`);
    expect(state.success?.redirectTo).not.toContain("created=");
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenCalledWith({
      operation: "create",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
      fallbackType: "income",
    });
  });

  it("支出・収入の更新は検証済みの遷移元と更新後の通知内容を返す", async () => {
    mocks.updateExpense.mockResolvedValue({ kind: "ok" });
    mocks.updateIncome.mockResolvedValue({ kind: "ok" });
    mocks.loadTransactionSaveFeedback.mockResolvedValue({
      title: "支出を更新しました",
    });

    const expenseState = await updateExpenseAction(
      GROUP_ID,
      TRANSACTION_ID,
      `/groups/${GROUP_ID}/history`,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData(),
    );
    expect(expenseState.status).toBe("success");
    expect(expenseState.success?.redirectTo).toBe(
      `/groups/${GROUP_ID}/history`,
    );
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenLastCalledWith({
      operation: "update",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
      fallbackType: "expense",
    });

    // 検証できない遷移元はグループホームへ戻す（クライアントの値をそのまま返さない）
    const incomeState = await updateIncomeAction(
      GROUP_ID,
      TRANSACTION_ID,
      "https://evil.example/phish",
      INITIAL_EXPENSE_ACTION_STATE,
      incomeFormData(),
    );
    expect(incomeState.success?.redirectTo).toBe(`/groups/${GROUP_ID}`);
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenLastCalledWith({
      operation: "update",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
      fallbackType: "income",
    });
  });

  it("削除は削除前に行を読んで通知内容を作り、成功結果を返す", async () => {
    const order: string[] = [];
    mocks.loadTransactionSaveFeedback.mockImplementation(async () => {
      order.push("load");
      return { title: "支出を削除しました", description: "9/19 食費 ￥1,200" };
    });
    mocks.deleteTransaction.mockImplementation(async () => {
      order.push("delete");
      return { kind: "ok" };
    });

    const state = await deleteTransactionAction(
      GROUP_ID,
      TRANSACTION_ID,
      `/groups/${GROUP_ID}`,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData(),
    );

    expect(order).toEqual(["load", "delete"]);
    expect(state).toEqual({
      status: "success",
      success: {
        redirectTo: `/groups/${GROUP_ID}`,
        feedback: {
          title: "支出を削除しました",
          description: "9/19 食費 ￥1,200",
        },
      },
    });
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenCalledWith({
      operation: "delete",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
    });
  });

  it("失敗時は従来どおりerrorを返し、通知内容を作らない (AC-TXN-019-6)", async () => {
    mocks.updateExpense.mockResolvedValue({ kind: "conflict" });
    const conflict = await updateExpenseAction(
      GROUP_ID,
      TRANSACTION_ID,
      `/groups/${GROUP_ID}`,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData(),
    );
    expect(conflict.status).toBe("error");
    expect(conflict.message).toContain("他のメンバーが先に");
    expect(conflict.success).toBeUndefined();

    mocks.createExpense.mockRejectedValue(new Error("db"));
    const failed = await createExpenseAction(
      GROUP_ID,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData(),
    );
    expect(failed.status).toBe("error");
    expect(failed.success).toBeUndefined();

    const invalid = await createExpenseAction(
      GROUP_ID,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData({ amountMinor: "abc" }),
    );
    expect(invalid.status).toBe("error");
    expect(invalid.fieldErrors?.amountMinor).toBeDefined();

    expect(mocks.loadTransactionSaveFeedback).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
