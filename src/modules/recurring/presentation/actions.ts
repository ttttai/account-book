"use server";

import { revalidatePath } from "next/cache";

import { calculateExpenseAllocations } from "@/modules/transactions";

import {
  createRecurringTransaction,
  endRecurringTransaction,
  updateRecurringTransaction,
} from "../application/save-recurring-transaction";
import type { RecurringCommandResult } from "../application/recurring-types";
import {
  createRecurringInputSchema,
  endRecurringInputSchema,
  updateRecurringInputSchema,
} from "../domain/recurring-input";
import type { RecurringAllocation } from "../domain/recurring-schedule";
import type { RecurringActionState } from "./action-state";

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

function formInput(groupId: string, formData: FormData) {
  return {
    groupId,
    type: value(formData, "type"),
    name: value(formData, "name"),
    amountMinor: value(formData, "amountMinor"),
    dayOfMonth: value(formData, "dayOfMonth"),
    startMonth: value(formData, "startMonth"),
    endMonth: value(formData, "endMonth"),
    categoryId: value(formData, "categoryId"),
    partyMemberId: value(formData, "partyMemberId"),
    allocationMethod: value(formData, "allocationMethod"),
    selectedMemberIds: values(formData, "selectedMemberIds"),
    customAllocations: customAllocations(formData),
    memo: value(formData, "memo"),
  };
}

// command結果を利用者向けメッセージへ変換する
function toErrorState(result: RecurringCommandResult): RecurringActionState {
  switch (result.kind) {
    case "conflict":
      return {
        status: "error",
        message:
          "他のメンバーが先にこの固定費を更新しました。画面を再読み込みして最新の内容を確認してください。",
      };
    case "not_found":
      return {
        status: "error",
        message: "この固定費は見つからないか、すでに削除されています。",
      };
    case "forbidden":
      return {
        status: "error",
        message: "固定費を設定する権限がありません。",
      };
    case "invalid":
      return { status: "error", message: "入力内容を確認してください。" };
    default:
      return {
        status: "error",
        message:
          "固定費を保存できませんでした。接続状態を確認して、もう一度お試しください。",
      };
  }
}

function revalidateRecurringScreens(groupId: string): void {
  revalidatePath(`/groups/${groupId}/recurring-transactions`);
  revalidatePath(`/groups/${groupId}`);
}

// 収入は負担額を持たないため空配列、支出は負担方法から負担額を確定する（REC-003）
function resolveAllocations(input: {
  type: "expense" | "income";
  amountMinor: number;
  allocationMethod: "equal" | "single" | "custom";
  selectedMemberIds: readonly string[];
  customAllocations: readonly Readonly<{
    memberId: string;
    amountMinor: number;
  }>[];
}): readonly RecurringAllocation[] | null {
  if (input.type === "income") return [];
  try {
    return calculateExpenseAllocations({
      method: input.allocationMethod,
      amountMinor: input.amountMinor,
      selectedMemberIds: input.selectedMemberIds,
      customAllocations: input.customAllocations,
    });
  } catch {
    return null;
  }
}

// 固定費の作成Server Action。入力検証と負担額計算を経てDB関数へ渡す
export async function createRecurringAction(
  groupId: string,
  _previousState: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const result = createRecurringInputSchema.safeParse(
    formInput(groupId, formData),
  );
  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  const allocations = resolveAllocations(result.data);
  if (allocations === null) {
    return {
      status: "error",
      message: "負担額の合計が金額と一致するように入力してください。",
      fieldErrors: {
        allocationMethod: ["1人以上の負担額を正しく設定してください。"],
      },
    };
  }

  const commandResult = await createRecurringTransaction(
    result.data,
    allocations,
  );
  if (commandResult.kind !== "ok") return toErrorState(commandResult);

  revalidateRecurringScreens(result.data.groupId);
  return { status: "success", message: "固定費を登録しました。" };
}

// 固定費の編集Server Action。versionを添えて楽観的ロック付きで更新する
export async function updateRecurringAction(
  groupId: string,
  recurringTransactionId: string,
  _previousState: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const result = updateRecurringInputSchema.safeParse({
    ...formInput(groupId, formData),
    recurringTransactionId,
    expectedVersion: value(formData, "expectedVersion"),
  });
  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  const allocations = resolveAllocations(result.data);
  if (allocations === null) {
    return {
      status: "error",
      message: "負担額の合計が金額と一致するように入力してください。",
      fieldErrors: {
        allocationMethod: ["1人以上の負担額を正しく設定してください。"],
      },
    };
  }

  const commandResult = await updateRecurringTransaction(
    result.data,
    allocations,
  );
  if (commandResult.kind !== "ok") return toErrorState(commandResult);

  revalidateRecurringScreens(result.data.groupId);
  return { status: "success", message: "固定費を更新しました。" };
}

// 固定費の終了Server Action。end_monthを設定し翌月以降の展開を止める
export async function endRecurringAction(
  groupId: string,
  recurringTransactionId: string,
  _previousState: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const result = endRecurringInputSchema.safeParse({
    groupId,
    recurringTransactionId,
    expectedVersion: value(formData, "expectedVersion"),
    endMonth: value(formData, "endMonth"),
  });
  if (!result.success) {
    return {
      status: "error",
      message: "終了する月を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  const commandResult = await endRecurringTransaction(result.data);
  if (commandResult.kind !== "ok") return toErrorState(commandResult);

  revalidateRecurringScreens(result.data.groupId);
  return { status: "success", message: "固定費を終了しました。" };
}
