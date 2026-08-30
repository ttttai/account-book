"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createExpense } from "../application/create-expense";
import { createIncome } from "../application/create-income";
import { deleteTransaction } from "../application/delete-transaction";
import type { TransactionCommandResult } from "../application/edit-types";
import { updateExpense } from "../application/update-expense";
import { updateIncome } from "../application/update-income";
import { resolveEditReturnPath } from "../domain/edit-return-path";
import { calculateExpenseAllocations } from "../domain/expense-allocation";
import type { ExpenseAllocation } from "../domain/expense-allocation";
import { createExpenseInputSchema } from "../domain/expense-input";
import {
  createIncomeInputSchema,
  updateIncomeInputSchema,
} from "../domain/income-input";
import { updateExpenseInputSchema } from "../domain/update-expense-input";
import type { ExpenseActionState } from "./action-state";

function value(formData: FormData, name: string): string {
  const field = formData.get(name);
  return typeof field === "string" ? field : "";
}

function values(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((field): field is string => typeof field === "string");
}

// "customAmount:<memberId>"形式のフィールドからカスタム負担入力を組み立てる（空欄は0円扱い）
function customAllocations(formData: FormData) {
  return [...formData.entries()]
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("customAmount:") && typeof entry[1] === "string",
    )
    .map(([name, amountMinor]) => ({
      memberId: name.slice("customAmount:".length),
      amountMinor: amountMinor === "" ? "0" : amountMinor,
    }));
}

// 支出登録フォームのServer Action。入力検証と負担額計算を経て支出を登録し、グループ画面へ戻す
export async function createExpenseAction(
  groupId: string,
  _previousState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const result = createExpenseInputSchema.safeParse({
    groupId,
    amountMinor: value(formData, "amountMinor"),
    transactionDate: value(formData, "transactionDate"),
    categoryId: value(formData, "categoryId"),
    payerMemberId: value(formData, "payerMemberId"),
    allocationMethod: value(formData, "allocationMethod"),
    selectedMemberIds: values(formData, "selectedMemberIds"),
    customAllocations: customAllocations(formData),
    memo: value(formData, "memo"),
    clientRequestId: value(formData, "clientRequestId"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  let allocations: readonly ExpenseAllocation[];
  try {
    allocations = calculateExpenseAllocations({
      method: result.data.allocationMethod,
      amountMinor: result.data.amountMinor,
      selectedMemberIds: result.data.selectedMemberIds,
      customAllocations: result.data.customAllocations,
    });
  } catch {
    return {
      status: "error",
      message: "負担額の合計が支出金額と一致するように入力してください。",
      fieldErrors: {
        allocationMethod: ["1人以上の負担額を正しく設定してください。"],
      },
    };
  }

  try {
    await createExpense(result.data, allocations);
  } catch {
    return {
      status: "error",
      message:
        "支出を登録できませんでした。所属と接続状態を確認して、もう一度お試しください。",
    };
  }

  revalidatePath(`/groups/${result.data.groupId}`);
  redirect(`/groups/${result.data.groupId}?created=expense`);
}

// 競合・対象なし・検証・その他のcommand結果を利用者向けメッセージへ変換する
function commandErrorMessage(
  result: Exclude<TransactionCommandResult, Readonly<{ kind: "ok" }>>,
  invalidMessage: string,
): string {
  if (result.kind === "conflict") {
    return "他のメンバーが先にこの取引を更新しました。画面を再読み込みして最新の内容を確認してください。";
  }
  if (result.kind === "not_found") {
    return "この取引は見つからないか、すでに削除されています。";
  }
  if (result.kind === "invalid") return invalidMessage;
  return "処理を完了できませんでした。接続状態を確認して、もう一度お試しください。";
}

// 変更後のグループ画面（ホーム・履歴）を再検証する
function revalidateGroupScreens(groupId: string): void {
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/history`);
}

// 支出編集フォームのServer Action。楽観的ロック付きで更新し、検証済みの遷移元へ戻す
export async function updateExpenseAction(
  groupId: string,
  transactionId: string,
  unsafeReturnTo: string,
  _previousState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const result = updateExpenseInputSchema.safeParse({
    groupId,
    transactionId,
    expectedVersion: value(formData, "expectedVersion"),
    amountMinor: value(formData, "amountMinor"),
    transactionDate: value(formData, "transactionDate"),
    categoryId: value(formData, "categoryId"),
    payerMemberId: value(formData, "payerMemberId"),
    allocationMethod: value(formData, "allocationMethod"),
    selectedMemberIds: values(formData, "selectedMemberIds"),
    customAllocations: customAllocations(formData),
    memo: value(formData, "memo"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  let allocations: readonly ExpenseAllocation[];
  try {
    allocations = calculateExpenseAllocations({
      method: result.data.allocationMethod,
      amountMinor: result.data.amountMinor,
      selectedMemberIds: result.data.selectedMemberIds,
      customAllocations: result.data.customAllocations,
    });
  } catch {
    return {
      status: "error",
      message: "負担額の合計が支出金額と一致するように入力してください。",
      fieldErrors: {
        allocationMethod: ["1人以上の負担額を正しく設定してください。"],
      },
    };
  }

  const commandResult = await updateExpense(result.data, allocations);
  if (commandResult.kind !== "ok") {
    return {
      status: "error",
      message: commandErrorMessage(
        commandResult,
        "入力内容を確認してください。",
      ),
    };
  }

  revalidateGroupScreens(result.data.groupId);
  redirect(resolveEditReturnPath(unsafeReturnTo, result.data.groupId));
}

// 取引削除のServer Action。楽観的ロック付きで物理削除し、検証済みの遷移元へ戻す
export async function deleteTransactionAction(
  groupId: string,
  transactionId: string,
  unsafeReturnTo: string,
  _previousState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const expectedVersion = Number(value(formData, "expectedVersion"));

  const commandResult = await deleteTransaction({
    groupId,
    transactionId,
    expectedVersion,
  });
  if (commandResult.kind !== "ok") {
    return {
      status: "error",
      message: commandErrorMessage(
        commandResult,
        "削除できませんでした。画面を再読み込みしてください。",
      ),
    };
  }

  revalidateGroupScreens(groupId);
  redirect(resolveEditReturnPath(unsafeReturnTo, groupId));
}

// 収入登録フォームのServer Action。入力検証を経て収入を登録し、グループ画面へ戻す
export async function createIncomeAction(
  groupId: string,
  _previousState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const result = createIncomeInputSchema.safeParse({
    groupId,
    amountMinor: value(formData, "amountMinor"),
    transactionDate: value(formData, "transactionDate"),
    categoryId: value(formData, "categoryId"),
    recipientMemberId: value(formData, "recipientMemberId"),
    memo: value(formData, "memo"),
    clientRequestId: value(formData, "clientRequestId"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  try {
    await createIncome(result.data);
  } catch {
    return {
      status: "error",
      message:
        "収入を登録できませんでした。所属と接続状態を確認して、もう一度お試しください。",
    };
  }

  revalidateGroupScreens(result.data.groupId);
  redirect(`/groups/${result.data.groupId}?created=income`);
}

// 取引登録の入口Action。フォームの種別に応じて支出・収入のActionへ振り分ける
export async function createTransactionAction(
  groupId: string,
  previousState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  return value(formData, "transactionType") === "income"
    ? createIncomeAction(groupId, previousState, formData)
    : createExpenseAction(groupId, previousState, formData);
}

// 収入編集フォームのServer Action。楽観的ロック付きで更新し、検証済みの遷移元へ戻す
export async function updateIncomeAction(
  groupId: string,
  transactionId: string,
  unsafeReturnTo: string,
  _previousState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const result = updateIncomeInputSchema.safeParse({
    groupId,
    transactionId,
    expectedVersion: value(formData, "expectedVersion"),
    amountMinor: value(formData, "amountMinor"),
    transactionDate: value(formData, "transactionDate"),
    categoryId: value(formData, "categoryId"),
    recipientMemberId: value(formData, "recipientMemberId"),
    memo: value(formData, "memo"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  const commandResult = await updateIncome(result.data);
  if (commandResult.kind !== "ok") {
    return {
      status: "error",
      message: commandErrorMessage(
        commandResult,
        "入力内容を確認してください。",
      ),
    };
  }

  revalidateGroupScreens(result.data.groupId);
  redirect(resolveEditReturnPath(unsafeReturnTo, result.data.groupId));
}
