"use server";

import { revalidatePath } from "next/cache";

import { addCategory } from "../application/add-category";
import { archiveCategory } from "../application/archive-category";
import { CategoryCommandError } from "../application/category-command-error";
import { moveCategory } from "../application/move-category";
import { renameCategory } from "../application/rename-category";
import {
  addCategorySchema,
  archiveCategorySchema,
  moveCategorySchema,
  renameCategorySchema,
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

export async function renameCategoryAction(
  groupId: string,
  categoryId: string,
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const result = renameCategorySchema.safeParse({
    groupId,
    categoryId,
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
    await renameCategory(result.data);
  } catch (error) {
    return toErrorState(error);
  }

  revalidateCategoryScreens(result.data.groupId);
  return { status: "success", message: "カテゴリ名を変更しました。" };
}

export async function moveCategoryAction(
  groupId: string,
  categoryId: string,
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const result = moveCategorySchema.safeParse({
    groupId,
    categoryId,
    direction: value(formData, "direction"),
  });
  if (!result.success) {
    return { status: "error", message: "並び替えの内容を確認してください。" };
  }

  let moveResult: Awaited<ReturnType<typeof moveCategory>>;
  try {
    moveResult = await moveCategory(result.data);
  } catch (error) {
    return toErrorState(error);
  }

  if (moveResult === "not_found") {
    return {
      status: "error",
      message: "対象のカテゴリが見つかりません。表示を更新してください。",
    };
  }
  if (moveResult === "at_edge") {
    return {
      status: "success",
      message: "これ以上その方向へは移動できません。",
    };
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
    message: "カテゴリをアーカイブしました。過去の取引の表示は変わりません。",
  };
}
