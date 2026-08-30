"use server";

import { revalidatePath } from "next/cache";

import { addCategory } from "../application/add-category";
import { archiveCategory } from "../application/archive-category";
import { CategoryCommandError } from "../application/category-command-error";
import { updateCategory } from "../application/update-category";
import { repositionCategory } from "../application/reposition-category";
import {
  addCategorySchema,
  archiveCategorySchema,
  repositionCategorySchema,
  updateCategorySchema,
} from "../domain/category-input";
import type { CategoryActionState } from "./action-state";

function value(formData: FormData, name: string): string {
  const field = formData.get(name);
  return typeof field === "string" ? field : "";
}

function revalidateCategoryScreens(groupId: string): void {
  revalidatePath(`/groups/${groupId}/categories`);
  revalidatePath(`/groups/${groupId}/transactions/new`);
}

function toErrorState(error: unknown): CategoryActionState {
  if (error instanceof CategoryCommandError) {
    switch (error.code) {
      case "FORBIDDEN":
        return {
          status: "error",
          message: "カテゴリを管理する権限がありません。",
        };
      case "UNAUTHENTICATED":
        return {
          status: "error",
          message: "ログイン状態を確認して、もう一度お試しください。",
        };
      case "DUPLICATE_NAME":
        return {
          status: "error",
          message: "同じ種別に同じ名前のカテゴリがすでにあります。",
          fieldErrors: { name: ["別の名前を入力してください。"] },
        };
      case "INVALID_INPUT":
        return { status: "error", message: "入力内容を確認してください。" };
      default:
        break;
    }
  }
  return {
    status: "error",
    message:
      "カテゴリを更新できませんでした。接続状態を確認して、もう一度お試しください。",
  };
}

export async function addCategoryAction(
  groupId: string,
  type: string,
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const result = addCategorySchema.safeParse({
    groupId,
    type,
    name: value(formData, "name"),
  });
  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: { name: result.error.flatten().fieldErrors.name },
    };
  }

  try {
    await addCategory(result.data);
  } catch (error) {
    return toErrorState(error);
  }

  revalidateCategoryScreens(result.data.groupId);
  return { status: "success", message: "カテゴリを追加しました。" };
}

// 編集パネルの保存。名称と色を1つの操作で更新する
export async function updateCategoryAction(
  groupId: string,
  categoryId: string,
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const result = updateCategorySchema.safeParse({
    groupId,
    categoryId,
    name: value(formData, "name"),
    color: value(formData, "color"),
  });
  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: { name: result.error.flatten().fieldErrors.name },
    };
  }

  try {
    await updateCategory(result.data);
  } catch (error) {
    return toErrorState(error);
  }

  revalidateCategoryScreens(result.data.groupId);
  return { status: "success", message: "カテゴリを更新しました。" };
}

// ドラッグ並び替えの確定。対象カテゴリと移動先位置だけを受け取り、全体順序はサーバーが組み立てる
export async function repositionCategoryAction(
  groupId: string,
  categoryId: string,
  position: number,
): Promise<CategoryActionState> {
  const result = repositionCategorySchema.safeParse({
    groupId,
    categoryId,
    position,
  });
  if (!result.success) {
    return { status: "error", message: "並び替えの内容を確認してください。" };
  }

  let repositionResult: Awaited<ReturnType<typeof repositionCategory>>;
  try {
    repositionResult = await repositionCategory(result.data);
  } catch (error) {
    return toErrorState(error);
  }

  if (repositionResult === "not_found") {
    return {
      status: "error",
      message: "対象のカテゴリが見つかりません。表示を更新してください。",
    };
  }
  if (repositionResult === "unchanged") {
    return { status: "success", message: "並び順は変更されていません。" };
  }

  revalidateCategoryScreens(result.data.groupId);
  return { status: "success", message: "並び順を変更しました。" };
}

export async function archiveCategoryAction(
  groupId: string,
  categoryId: string,
  _previousState: CategoryActionState,
  _formData: FormData,
): Promise<CategoryActionState> {
  const result = archiveCategorySchema.safeParse({ groupId, categoryId });
  if (!result.success) {
    return {
      status: "error",
      message: "対象のカテゴリを確認できませんでした。",
    };
  }

  try {
    await archiveCategory(result.data);
  } catch (error) {
    return toErrorState(error);
  }

  revalidateCategoryScreens(result.data.groupId);
  return {
    status: "success",
    message: "カテゴリを削除しました。過去の取引の表示は変わりません。",
  };
}
