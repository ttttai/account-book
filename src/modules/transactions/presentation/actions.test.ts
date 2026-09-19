import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createExpense: vi.fn(),
  createIncome: vi.fn(),
  updateExpense: vi.fn(),
  updateIncome: vi.fn(),
  deleteTransaction: vi.fn(),
  loadTransactionSaveFeedback: vi.fn(),
  revalidatePath: vi.fn(),
  cookieSet: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
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
  const fields: Record<string, string> = {
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
  for (const [name, fieldValue] of Object.entries(fields)) {
    formData.set(name, fieldValue);
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

// cookieへ書いた通知内容と、直後のredirect先を取り出す
function writtenFeedback() {
  const [name, rawValue, options] = mocks.cookieSet.mock.calls[0] ?? [];
  return { name, feedback: JSON.parse(String(rawValue)), options };
}

describe("取引Server Actionの保存結果cookieとredirect (TXN-019, AC-TXN-019-1〜3)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.createExpense.mockReset();
    mocks.createIncome.mockReset();
    mocks.updateExpense.mockReset();
    mocks.updateIncome.mockReset();
    mocks.deleteTransaction.mockReset();
    mocks.loadTransactionSaveFeedback.mockReset();
  });

  it("支出登録は通知内容を短命cookieへ書いてからグループホームへredirectする", async () => {
    mocks.createExpense.mockResolvedValue(TRANSACTION_ID);
    mocks.loadTransactionSaveFeedback.mockResolvedValue(feedback);

    await expect(
      createExpenseAction(
        GROUP_ID,
        INITIAL_EXPENSE_ACTION_STATE,
        expenseFormData(),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/groups/${GROUP_ID}`);

    // 通知内容は保存済みの行（作成された取引ID）から組み立てる
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenCalledWith({
      operation: "create",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
      fallbackType: "expense",
    });
    const written = writtenFeedback();
    expect(written.name).toBe("save_feedback");
    expect(written.feedback).toEqual(feedback);
    expect(written.options).toMatchObject({
      path: "/",
      maxAge: 30,
      sameSite: "lax",
      httpOnly: false,
    });
    // cookieを書いてからredirectする
    expect(mocks.cookieSet.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/groups/${GROUP_ID}`);
  });

  it("収入登録も同じ形で書き、未使用の?created=を付けずにredirectする", async () => {
    mocks.createIncome.mockResolvedValue(TRANSACTION_ID);
    mocks.loadTransactionSaveFeedback.mockResolvedValue({
      title: "収入を登録しました",
    });

    await expect(
      createIncomeAction(
        GROUP_ID,
        INITIAL_EXPENSE_ACTION_STATE,
        incomeFormData(),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/groups/${GROUP_ID}`);

    expect(mocks.redirect).toHaveBeenCalledWith(`/groups/${GROUP_ID}`);
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenCalledWith({
      operation: "create",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
      fallbackType: "income",
    });
    expect(writtenFeedback().feedback).toEqual({
      title: "収入を登録しました",
    });
  });

  it("支出・収入の更新は検証済みの遷移元へredirectし、更新後の通知内容を書く", async () => {
    mocks.updateExpense.mockResolvedValue({ kind: "ok" });
    mocks.updateIncome.mockResolvedValue({ kind: "ok" });
    mocks.loadTransactionSaveFeedback.mockResolvedValue({
      title: "支出を更新しました",
    });

    await expect(
      updateExpenseAction(
        GROUP_ID,
        TRANSACTION_ID,
        `/groups/${GROUP_ID}/history`,
        INITIAL_EXPENSE_ACTION_STATE,
        expenseFormData(),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/groups/${GROUP_ID}/history`);
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenLastCalledWith({
      operation: "update",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
      fallbackType: "expense",
    });

    // 検証できない遷移元はグループホームへ戻す
    await expect(
      updateIncomeAction(
        GROUP_ID,
        TRANSACTION_ID,
        "https://evil.example/phish",
        INITIAL_EXPENSE_ACTION_STATE,
        incomeFormData(),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/groups/${GROUP_ID}`);
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenLastCalledWith({
      operation: "update",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
      fallbackType: "income",
    });
    expect(mocks.cookieSet).toHaveBeenCalledTimes(2);
  });

  it("削除は削除前に行を読んで通知内容を作り、削除後にcookieへ書いてredirectする", async () => {
    const order: string[] = [];
    mocks.loadTransactionSaveFeedback.mockImplementation(async () => {
      order.push("load");
      return { title: "支出を削除しました", description: "9/19 食費 ￥1,200" };
    });
    mocks.deleteTransaction.mockImplementation(async () => {
      order.push("delete");
      return { kind: "ok" };
    });
    mocks.cookieSet.mockImplementation(() => {
      order.push("cookie");
    });

    await expect(
      deleteTransactionAction(
        GROUP_ID,
        TRANSACTION_ID,
        `/groups/${GROUP_ID}`,
        INITIAL_EXPENSE_ACTION_STATE,
        expenseFormData(),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/groups/${GROUP_ID}`);

    expect(order).toEqual(["load", "delete", "cookie"]);
    expect(mocks.loadTransactionSaveFeedback).toHaveBeenCalledWith({
      operation: "delete",
      groupId: GROUP_ID,
      transactionId: TRANSACTION_ID,
    });
    expect(writtenFeedback().feedback).toEqual({
      title: "支出を削除しました",
      description: "9/19 食費 ￥1,200",
    });
  });

  it("失敗時は従来どおりerrorを返し、cookieもredirectもしない (AC-TXN-019-6)", async () => {
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

    mocks.createExpense.mockRejectedValue(new Error("db"));
    const failed = await createExpenseAction(
      GROUP_ID,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData(),
    );
    expect(failed.status).toBe("error");

    const invalid = await createExpenseAction(
      GROUP_ID,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData({ amountMinor: "abc" }),
    );
    expect(invalid.status).toBe("error");
    expect(invalid.fieldErrors?.amountMinor).toBeDefined();

    // 削除の競合は行を読んでも、cookieを書かずerrorを返す
    mocks.loadTransactionSaveFeedback.mockResolvedValue({
      title: "支出を削除しました",
    });
    mocks.deleteTransaction.mockResolvedValue({ kind: "conflict" });
    const deleteConflict = await deleteTransactionAction(
      GROUP_ID,
      TRANSACTION_ID,
      `/groups/${GROUP_ID}`,
      INITIAL_EXPENSE_ACTION_STATE,
      expenseFormData(),
    );
    expect(deleteConflict.status).toBe("error");

    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
