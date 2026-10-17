"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { formatAnalyticsMonth } from "@/modules/analytics";
import {
  encodeSaveFeedbackCookie,
  SAVE_FEEDBACK_COOKIE_MAX_AGE_SECONDS,
  SAVE_FEEDBACK_COOKIE_NAME,
  type SaveFeedback,
} from "@/modules/ui";

import {
  createAssetCategory,
  deleteAssetSnapshot,
  saveAssetSnapshot,
  setAssetCategoryArchived,
  updateAssetCategory,
} from "../application/asset-commands";
import type { AssetCommandResult } from "../application/asset-types";
import {
  createAssetCategoryInputSchema,
  deleteAssetSnapshotInputSchema,
  saveAssetSnapshotInputSchema,
  setAssetCategoryArchivedInputSchema,
  updateAssetCategoryInputSchema,
} from "../domain/asset-input";
import type { AssetActionState } from "./action-state";

/** 資産額の入力欄は`asset:<memberId>:<categoryId>`の名前で送る */
const ASSET_VALUE_PREFIX = "asset:";

function value(formData: FormData, name: string): string {
  const field = formData.get(name);
  return typeof field === "string" ? field : "";
}

// "asset:<memberId>:<categoryId>"形式のフィールドから資産額の組を組み立てる。空欄は0円として送る
function assetValues(formData: FormData) {
  return [...formData.entries()]
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith(ASSET_VALUE_PREFIX) && typeof entry[1] === "string",
    )
    .map(([name, amountMinor]) => {
      const [memberId = "", categoryId = ""] = name
        .slice(ASSET_VALUE_PREFIX.length)
        .split(":");
      return { memberId, categoryId, amountMinor };
    });
}

// command結果を利用者向けメッセージへ変換する
function toErrorState(
  result: AssetCommandResult,
  subject: "record" | "category",
): AssetActionState {
  switch (result.kind) {
    case "conflict":
      return {
        status: "error",
        message:
          subject === "record"
            ? "他のメンバーが先にこの月の資産を保存または削除しました。画面を再読み込みして最新の内容を確認してください。"
            : "他のメンバーが先にこの資産区分を変更しました。画面を再読み込みして最新の内容を確認してください。",
      };
    case "duplicate":
      return {
        status: "error",
        message: "同じ名前の資産区分があります。",
        fieldErrors: { name: ["同じ名前の資産区分があります。"] },
      };
    case "forbidden":
      return {
        status: "error",
        message:
          subject === "record"
            ? "このグループの資産を記録する権限がありません。"
            : "資産区分を変更する権限がありません。",
      };
    case "invalid":
      return {
        status: "error",
        message:
          subject === "record"
            ? "入力内容を確認してください。当月より後の月は記録できません。"
            : "入力内容を確認してください。資産区分は8件まで登録できます。",
      };
    default:
      return {
        status: "error",
        message:
          "保存できませんでした。接続状態を確認して、もう一度お試しください。",
      };
  }
}

// 資産推移と記録画面、導線を置く分析画面を更新する
function revalidateAssetScreens(groupId: string): void {
  revalidatePath(`/groups/${groupId}/assets`);
  revalidatePath(`/groups/${groupId}/assets/record`);
  revalidatePath(`/groups/${groupId}/asset-categories`);
}

// 保存結果の通知を短命cookieへ書き、資産推移へredirectする (AC-AST-004-3、TXN-019と同じ仕組み)
async function redirectToTrendWithFeedback(
  groupId: string,
  feedback: SaveFeedback,
): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.set(
    SAVE_FEEDBACK_COOKIE_NAME,
    encodeSaveFeedbackCookie(feedback),
    {
      path: "/",
      maxAge: SAVE_FEEDBACK_COOKIE_MAX_AGE_SECONDS,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    },
  );
  redirect(`/groups/${encodeURIComponent(groupId)}/assets`);
}

// 資産記録の保存Server Action。入力を検証してDB関数へ渡し、成功後は資産推移へ戻す (AST-002、AST-005)
export async function saveAssetSnapshotAction(
  groupId: string,
  _previousState: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const result = saveAssetSnapshotInputSchema.safeParse({
    groupId,
    month: value(formData, "month"),
    expectedVersion: value(formData, "expectedVersion"),
    values: assetValues(formData),
  });
  if (!result.success) {
    return { status: "error", message: "入力内容を確認してください。" };
  }

  const commandResult = await saveAssetSnapshot(result.data);
  if (commandResult.kind !== "ok") return toErrorState(commandResult, "record");

  revalidateAssetScreens(result.data.groupId);
  return redirectToTrendWithFeedback(result.data.groupId, {
    title: `${formatAnalyticsMonth(result.data.month)}の資産を保存しました`,
  });
}

// 資産記録の削除Server Action。確認操作を経た後に呼ばれ、記録月の資産記録を物理削除する (AC-AST-004-2)
export async function deleteAssetSnapshotAction(
  groupId: string,
  _previousState: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const result = deleteAssetSnapshotInputSchema.safeParse({
    groupId,
    month: value(formData, "month"),
    expectedVersion: value(formData, "expectedVersion"),
  });
  if (!result.success) {
    return { status: "error", message: "削除する月を確認してください。" };
  }

  const commandResult = await deleteAssetSnapshot(result.data);
  if (commandResult.kind !== "ok") return toErrorState(commandResult, "record");

  revalidateAssetScreens(result.data.groupId);
  return redirectToTrendWithFeedback(result.data.groupId, {
    title: `${formatAnalyticsMonth(result.data.month)}の資産記録を削除しました`,
  });
}

// 資産区分の追加Server Action (AST-006)
export async function createAssetCategoryAction(
  groupId: string,
  _previousState: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const result = createAssetCategoryInputSchema.safeParse({
    groupId,
    name: value(formData, "name"),
    color: value(formData, "color"),
  });
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: fieldErrors.name ? { name: fieldErrors.name } : {},
    };
  }

  const commandResult = await createAssetCategory(result.data);
  if (commandResult.kind !== "ok") {
    return toErrorState(commandResult, "category");
  }
  revalidateAssetScreens(result.data.groupId);
  return {
    status: "success",
    message: `資産区分「${result.data.name}」を追加しました。`,
  };
}

// 資産区分の名称・色の変更Server Action (AST-006)
export async function updateAssetCategoryAction(
  groupId: string,
  categoryId: string,
  _previousState: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const result = updateAssetCategoryInputSchema.safeParse({
    groupId,
    categoryId,
    expectedVersion: value(formData, "expectedVersion"),
    name: value(formData, "name"),
    color: value(formData, "color"),
  });
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: fieldErrors.name ? { name: fieldErrors.name } : {},
    };
  }

  const commandResult = await updateAssetCategory(result.data);
  if (commandResult.kind !== "ok") {
    return toErrorState(commandResult, "category");
  }
  revalidateAssetScreens(result.data.groupId);
  return { status: "success", message: "資産区分を保存しました。" };
}

// 資産区分の削除（アーカイブ）・復元Server Action (AC-AST-006-1、AC-AST-006-4)
export async function setAssetCategoryArchivedAction(
  groupId: string,
  categoryId: string,
  archived: boolean,
  _previousState: AssetActionState,
  formData: FormData,
): Promise<AssetActionState> {
  const result = setAssetCategoryArchivedInputSchema.safeParse({
    groupId,
    categoryId,
    expectedVersion: value(formData, "expectedVersion"),
    archived,
  });
  if (!result.success) {
    return { status: "error", message: "対象の資産区分を確認してください。" };
  }

  const commandResult = await setAssetCategoryArchived(result.data);
  if (commandResult.kind !== "ok") {
    return toErrorState(commandResult, "category");
  }
  revalidateAssetScreens(result.data.groupId);
  return {
    status: "success",
    message: archived
      ? "資産区分を削除しました。"
      : "資産区分を元に戻しました。",
  };
}
