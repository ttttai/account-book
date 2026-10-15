import "server-only";

import { z } from "zod";

import { toCategoryColor } from "@/modules/categories";
import {
  type GroupReadContext,
  type GroupReadMember,
  loadGroupMembers,
} from "@/modules/groups/server";

import type {
  AssetCategoryItem,
  AssetMemberItem,
  AssetSnapshotItem,
} from "../domain/asset-trend";

/** 推移画面が1回で読む記録月の上限 (§9) */
export const ASSET_SNAPSHOT_READ_LIMIT = 600;

const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  sort_order: z.number().int(),
  archived_at: z.string().nullable(),
  version: z.number().int().min(1),
});

const snapshotRowSchema = z.object({
  id: z.uuid(),
  month: z.string(),
  version: z.number().int().min(1),
  updated_by: z.uuid(),
  updated_at: z.string(),
  asset_snapshot_values: z.array(
    z.object({
      member_id: z.uuid(),
      asset_category_id: z.uuid(),
      amount_minor: z.number().int().min(1),
    }),
  ),
});

const roleRowSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});

export type AssetCategoryRow = AssetCategoryItem &
  Readonly<{ version: number }>;

export type AssetSnapshotRow = AssetSnapshotItem &
  Readonly<{ version: number; updatedBy: string; updatedAt: string }>;

const SNAPSHOT_COLUMNS =
  "id, month, version, updated_by, updated_at, asset_snapshot_values(member_id, asset_category_id, amount_minor)";

// DBの月初日（YYYY-MM-DD）を記録月（YYYY-MM）へ変換する
function toMonth(date: string): string {
  return date.slice(0, 7);
}

// 記録月（YYYY-MM）をDBの月初日へ変換する
export function assetMonthToDate(month: string): string {
  return `${month}-01`;
}

function toSnapshotRow(
  row: z.infer<typeof snapshotRowSchema>,
): AssetSnapshotRow {
  return {
    month: toMonth(row.month),
    version: row.version,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    values: row.asset_snapshot_values.map((value) => ({
      memberId: value.member_id,
      categoryId: value.asset_category_id,
      amountMinor: value.amount_minor,
    })),
  };
}

// 資産区分を並び順で読む。アーカイブ済みは過去の記録の表示に使うため含める
export async function loadAssetCategories(
  context: GroupReadContext,
): Promise<readonly AssetCategoryRow[]> {
  const { data, error } = await context.supabase
    .from("asset_categories")
    .select("id, name, color, sort_order, archived_at, version")
    .eq("group_id", context.group.id)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("資産区分を取得できませんでした。");
  return z
    .array(categoryRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: toCategoryColor(row.color),
      sortOrder: row.sort_order,
      archived: row.archived_at !== null,
      version: row.version,
    }));
}

// グループの資産記録を内訳ごと記録月の昇順で読む。内訳は埋め込みで読み、行数上限による欠落を避ける
export async function loadAssetSnapshots(
  context: GroupReadContext,
): Promise<readonly AssetSnapshotRow[]> {
  const { data, error } = await context.supabase
    .from("asset_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .eq("group_id", context.group.id)
    .order("month", { ascending: false })
    .limit(ASSET_SNAPSHOT_READ_LIMIT);
  if (error) throw new Error("資産記録を取得できませんでした。");
  return z
    .array(snapshotRowSchema)
    .parse(data ?? [])
    .map(toSnapshotRow)
    .reverse();
}

// 記録月の資産記録と、それより前で最も新しい資産記録（コピー元）を読む (AC-AST-003-1)
export async function loadAssetSnapshotWithCopySource(
  context: GroupReadContext,
  month: string,
): Promise<
  Readonly<{
    existing: AssetSnapshotRow | null;
    copySource: AssetSnapshotRow | null;
  }>
> {
  const [existingResult, sourceResult] = await Promise.all([
    context.supabase
      .from("asset_snapshots")
      .select(SNAPSHOT_COLUMNS)
      .eq("group_id", context.group.id)
      .eq("month", assetMonthToDate(month))
      .maybeSingle(),
    context.supabase
      .from("asset_snapshots")
      .select(SNAPSHOT_COLUMNS)
      .eq("group_id", context.group.id)
      .lt("month", assetMonthToDate(month))
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (existingResult.error || sourceResult.error) {
    throw new Error("資産記録を取得できませんでした。");
  }
  return {
    existing: existingResult.data
      ? toSnapshotRow(snapshotRowSchema.parse(existingResult.data))
      : null,
    copySource: sourceResult.data
      ? toSnapshotRow(snapshotRowSchema.parse(sourceResult.data))
      : null,
  };
}

// 操作者のroleは所属IDで1行だけ読む。表示制御にだけ使い、認可判断はDB関数が再確認する
export async function loadCurrentRole(
  context: GroupReadContext,
): Promise<"owner" | "admin" | "member"> {
  const { data, error } = await context.supabase
    .from("group_members")
    .select("role")
    .eq("id", context.currentMembershipId)
    .maybeSingle();
  if (error || !data) throw new Error("権限を取得できませんでした。");
  return roleRowSchema.parse(data).role;
}

// メンバーを表示順（自分、アクティブの参加順、削除済みの参加順）へ並べる (AC-AST-007-1)
export function orderAssetMembers(
  members: readonly GroupReadMember[],
): readonly GroupReadMember[] {
  const self = members.filter((member) => member.isCurrentUser);
  const active = members.filter(
    (member) => !member.isCurrentUser && member.status === "active",
  );
  const removed = members.filter((member) => member.status === "removed");
  return [...self, ...active, ...removed];
}

// 推移に表示するメンバー。削除済みメンバーは記録に現れる場合だけ含める
export async function loadAssetTrendMembers(
  context: GroupReadContext,
  snapshots: readonly AssetSnapshotItem[],
): Promise<readonly AssetMemberItem[]> {
  const recordedMemberIds = new Set(
    snapshots.flatMap((snapshot) =>
      snapshot.values.map((value) => value.memberId),
    ),
  );
  const members = orderAssetMembers(await loadGroupMembers(context));
  return members
    .filter(
      (member) =>
        member.status === "active" ||
        recordedMemberIds.has(member.membershipId),
    )
    .map((member) => ({
      memberId: member.membershipId,
      displayName: member.displayName,
      removed: member.status === "removed",
    }));
}
