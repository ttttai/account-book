import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { formatAssetCommandFailureLog } from "../domain/asset-command-log";
import type {
  CreateAssetCategoryInput,
  DeleteAssetSnapshotInput,
  SaveAssetSnapshotInput,
  SetAssetCategoryArchivedInput,
  UpdateAssetCategoryInput,
} from "../domain/asset-input";
import type { AssetCommandResult } from "./asset-types";
import { assetMonthToDate } from "./load-asset-data";

// DB関数は楽観的ロックの結果を結果行で返す。競合は40001で返さない（PostgRESTの自動再試行を避ける）
const outcomeRowsSchema = z
  .array(z.object({ outcome: z.string() }).passthrough())
  .length(1);

async function authenticatedClient() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) return null;
  return supabase;
}

// DB関数が返すSQLSTATEを、画面が区別して扱う結果種別へ変換する
// 42501/28000: 権限不足・未認証、22023: 入力不正、23505: 資産区分名の重複
function mapAssetCommandError(
  code: unknown,
): Exclude<AssetCommandResult, Readonly<{ kind: "ok" }>> {
  if (code === "42501" || code === "28000") return { kind: "forbidden" };
  if (code === "22023") return { kind: "invalid" };
  if (code === "23505") return { kind: "duplicate" };
  return { kind: "error" };
}

// 結果行のoutcomeを結果種別へ変換する。成功扱いのoutcomeだけをokにする
function mapOutcome(
  data: unknown,
  successOutcomes: readonly string[],
): AssetCommandResult {
  const rows = outcomeRowsSchema.safeParse(data);
  if (!rows.success) return { kind: "error" };
  const outcome = rows.data[0]?.outcome ?? "";
  if (outcome === "conflict") return { kind: "conflict" };
  return successOutcomes.includes(outcome) ? { kind: "ok" } : { kind: "error" };
}

// 失敗を操作名とcodeだけでサーバーlogへ残し、結果種別へ変換する（資産額をlogへ出さない）
function failure(operation: string, code: unknown) {
  console.error(formatAssetCommandFailureLog(operation, code));
  return mapAssetCommandError(code);
}

// 記録月の資産額をDB関数で保存する。所属・記録月の範囲・値の組・versionはDB側で再確認する (AST-002、AST-005)
export async function saveAssetSnapshot(
  input: SaveAssetSnapshotInput,
): Promise<AssetCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { data, error } = await supabase.rpc("save_asset_snapshot", {
    p_group_id: input.groupId,
    p_month: assetMonthToDate(input.month),
    p_expected_version: input.expectedVersion,
    p_values: input.values.map((value) => ({
      member_id: value.memberId,
      asset_category_id: value.categoryId,
      amount_minor: value.amountMinor,
    })),
  });
  if (error) return failure("saveAssetSnapshot", error.code);
  return mapOutcome(data, ["created", "updated", "unchanged"]);
}

// 記録月の資産記録を内訳ごと物理削除する (AC-AST-004-2)
export async function deleteAssetSnapshot(
  input: DeleteAssetSnapshotInput,
): Promise<AssetCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { data, error } = await supabase.rpc("delete_asset_snapshot", {
    p_group_id: input.groupId,
    p_month: assetMonthToDate(input.month),
    p_expected_version: input.expectedVersion,
  });
  if (error) return failure("deleteAssetSnapshot", error.code);
  return mapOutcome(data, ["deleted"]);
}

// 資産区分を追加する。owner/admin・件数上限・名称重複はDB側で再確認する (AST-006)
export async function createAssetCategory(
  input: CreateAssetCategoryInput,
): Promise<AssetCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { error } = await supabase.rpc("create_asset_category", {
    p_group_id: input.groupId,
    p_name: input.name,
    p_color: input.color,
  });
  if (error) return failure("createAssetCategory", error.code);
  return { kind: "ok" };
}

// 資産区分の名称・色を楽観的ロック付きで変更する (AST-006)
export async function updateAssetCategory(
  input: UpdateAssetCategoryInput,
): Promise<AssetCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { data, error } = await supabase.rpc("update_asset_category", {
    p_group_id: input.groupId,
    p_category_id: input.categoryId,
    p_expected_version: input.expectedVersion,
    p_name: input.name,
    p_color: input.color,
  });
  if (error) return failure("updateAssetCategory", error.code);
  return mapOutcome(data, ["updated", "unchanged"]);
}

// 資産区分をアーカイブ（削除）または復元する。過去の資産記録は変更しない (AC-AST-006-4)
export async function setAssetCategoryArchived(
  input: SetAssetCategoryArchivedInput,
): Promise<AssetCommandResult> {
  const supabase = await authenticatedClient();
  if (!supabase) return { kind: "forbidden" };

  const { data, error } = await supabase.rpc("set_asset_category_archived", {
    p_group_id: input.groupId,
    p_category_id: input.categoryId,
    p_expected_version: input.expectedVersion,
    p_archived: input.archived,
  });
  if (error) return failure("setAssetCategoryArchived", error.code);
  return mapOutcome(data, ["updated"]);
}
