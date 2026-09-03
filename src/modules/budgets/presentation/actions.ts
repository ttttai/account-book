"use server";

import { revalidatePath } from "next/cache";

import type { BudgetCommandResult } from "../application/budget-types";
import {
  disableGroupBudget,
  setGroupBudget,
} from "../application/save-group-budget";
import {
  disableBudgetInputSchema,
  setBudgetInputSchema,
} from "../domain/budget-input";
import type { BudgetActionState } from "./action-state";

const CATEGORY_LIMIT_PREFIX = "categoryLimit:";

function value(formData: FormData, name: string): string {
  const field = formData.get(name);
  return typeof field === "string" ? field : "";
}

// "categoryLimit:<categoryId>"形式のフィールドから内訳を組み立てる。空欄は未設定として除く
function categoryLimits(formData: FormData) {
  return [...formData.entries()]
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith(CATEGORY_LIMIT_PREFIX) &&
        typeof entry[1] === "string" &&
        entry[1].trim() !== "",
    )
    .map(([name, amountMinor]) => ({
      categoryId: name.slice(CATEGORY_LIMIT_PREFIX.length),
      amountMinor: amountMinor.trim(),
    }));
}

// command結果を利用者向けメッセージへ変換する
function toErrorState(result: BudgetCommandResult): BudgetActionState {
  switch (result.kind) {
    case "conflict":
      return {
        status: "error",
        message:
          "他のメンバーが先にこの月の予算を更新しました。画面を再読み込みして最新の内容を確認してください。",
      };
    case "not_found":
      return {
        status: "error",
        message: "対象のグループが見つかりません。",
      };
    case "forbidden":
      return { status: "error", message: "予算を設定する権限がありません。" };
    case "invalid":
      return {
        status: "error",
        message:
          "入力内容を確認してください。過去月の予算は変更できず、カテゴリ予算の合計はグループ予算以下にする必要があります。",
      };
    default:
      return {
        status: "error",
        message:
          "予算を保存できませんでした。接続状態を確認して、もう一度お試しください。",
      };
  }
}

// 予算画面と、予算カードを表示する分析概要を更新する
function revalidateBudgetScreens(groupId: string): void {
  revalidatePath(`/groups/${groupId}/budgets`);
  revalidatePath(`/groups/${groupId}/analytics`);
}

// 予算の設定・改定Server Action。入力を検証してDB関数へ渡す（owner/adminと合計上限はDB側でも再確認する）
export async function saveBudgetAction(
  groupId: string,
  _previousState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const result = setBudgetInputSchema.safeParse({
    groupId,
    effectiveMonth: value(formData, "effectiveMonth"),
    expectedVersion: value(formData, "expectedVersion"),
    totalAmountMinor: value(formData, "totalAmountMinor"),
    categoryLimits: categoryLimits(formData),
  });
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: {
        ...(fieldErrors.effectiveMonth
          ? { effectiveMonth: fieldErrors.effectiveMonth }
          : {}),
        ...(fieldErrors.totalAmountMinor
          ? { totalAmountMinor: fieldErrors.totalAmountMinor }
          : {}),
        ...(fieldErrors.categoryLimits
          ? { categoryLimits: fieldErrors.categoryLimits }
          : {}),
      },
    };
  }

  const commandResult = await setGroupBudget(result.data);
  if (commandResult.kind !== "ok") return toErrorState(commandResult);

  revalidateBudgetScreens(result.data.groupId);
  return { status: "success", message: "予算を保存しました。" };
}

// 予算の停止Server Action。選択月を開始月とする停止改定を保存する (AC-BUD-006-1)
export async function disableBudgetAction(
  groupId: string,
  _previousState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const result = disableBudgetInputSchema.safeParse({
    groupId,
    effectiveMonth: value(formData, "effectiveMonth"),
    expectedVersion: value(formData, "expectedVersion"),
  });
  if (!result.success) {
    return { status: "error", message: "停止する月を確認してください。" };
  }

  const commandResult = await disableGroupBudget(result.data);
  if (commandResult.kind !== "ok") return toErrorState(commandResult);

  revalidateBudgetScreens(result.data.groupId);
  return { status: "success", message: "この月から予算を停止しました。" };
}
