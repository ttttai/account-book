"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createExpense } from "../application/create-expense";
import { calculateExpenseAllocations } from "../domain/expense-allocation";
import type { ExpenseAllocation } from "../domain/expense-allocation";
import { createExpenseInputSchema } from "../domain/expense-input";
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
