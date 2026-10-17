import "server-only";

import { isAnalyticsMonth, shiftAnalyticsMonth } from "@/modules/analytics";
import {
  loadGroupMembers,
  resolveGroupReadContext,
} from "@/modules/groups/server";

import { ASSET_EARLIEST_MONTH } from "../domain/asset-input";
import { buildAssetRecordInitialValues } from "../domain/asset-record-form";
import type { AssetRecordForm, AssetRecordSearchInput } from "./asset-types";
import {
  loadAssetCategories,
  loadAssetSnapshotWithCopySource,
  loadCurrentRole,
  orderAssetMembers,
} from "./load-asset-data";

// 未指定はundefined、文字列以外（配列など）はnullを返して不正扱いにする
function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

// 記録画面の表示データ。記録月を検証し、将来月・範囲外・不正な形式では資産記録を読まない (AC-AST-002-2)
// 既存記録があればその値、なければ直前の記録をコピーした初期値を返す (AC-AST-003-1)
export async function getAssetRecordForm(
  unsafeGroupId: string,
  search: AssetRecordSearchInput,
): Promise<AssetRecordForm | null> {
  const context = await resolveGroupReadContext(unsafeGroupId, {
    includeRemovedMembers: true,
  });
  if (!context) return null;

  const monthValue = optionalString(search.month);
  const month = monthValue === undefined ? context.currentMonth : monthValue;
  if (
    month === null ||
    !isAnalyticsMonth(month) ||
    month < ASSET_EARLIEST_MONTH ||
    month > context.currentMonth
  ) {
    return {
      kind: "invalid",
      groupId: context.group.id,
      currentMonth: context.currentMonth,
    };
  }

  const [members, categories, snapshots, role] = await Promise.all([
    loadGroupMembers(context),
    loadAssetCategories(context),
    loadAssetSnapshotWithCopySource(context, month),
    loadCurrentRole(context),
  ]);
  const activeMembers = orderAssetMembers(members).filter(
    (member) => member.status === "active",
  );
  const activeCategories = categories.filter((category) => !category.archived);
  const initial = buildAssetRecordInitialValues(
    activeMembers.flatMap((member) =>
      activeCategories.map((category) => ({
        memberId: member.membershipId,
        categoryId: category.id,
      })),
    ),
    snapshots.existing,
    snapshots.copySource,
  );

  // 更新者の表示名は所属から引く。所属が無い（読めない）場合は名前を出さない
  const existing = snapshots.existing;
  const updatedByMembership = existing
    ? context.memberships.find(
        (membership) => membership.userId === existing.updatedBy,
      )
    : undefined;
  const updatedByName = updatedByMembership
    ? (members.find(
        (member) => member.membershipId === updatedByMembership.membershipId,
      )?.displayName ?? null)
    : null;

  const previousMonth = shiftAnalyticsMonth(month, -1);
  return {
    kind: "ready",
    group: { id: context.group.id, name: context.group.name },
    month,
    previousMonth: previousMonth >= ASSET_EARLIEST_MONTH ? previousMonth : null,
    nextMonth:
      month < context.currentMonth ? shiftAnalyticsMonth(month, 1) : null,
    currentMonth: context.currentMonth,
    members: activeMembers.map((member) => ({
      memberId: member.membershipId,
      displayName: member.displayName,
      isCurrentUser: member.isCurrentUser,
    })),
    categories: activeCategories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
    })),
    initialValues: initial.values,
    copiedFrom: initial.copiedFrom,
    existing: existing
      ? {
          version: existing.version,
          updatedByName,
          updatedAt: existing.updatedAt,
        }
      : null,
    canManageCategories: role === "owner" || role === "admin",
  };
}
