import "server-only";

import { resolveGroupReadContext } from "@/modules/groups/server";

import type { AssetTrendScreenData } from "./asset-types";
import {
  loadAssetCategories,
  loadAssetSnapshots,
  loadAssetTrendMembers,
} from "./load-asset-data";

// 資産推移画面のDTO。全記録・資産区分・表示用メンバーを1回で返し、切替では再取得しない (AST-001、AST-008)
// 未認証・非メンバー・不正なgroupIdは存在を明かさずnullを返す (AC-AST-001-1)
export async function getAssetTrend(
  unsafeGroupId: string,
): Promise<AssetTrendScreenData | null> {
  const context = await resolveGroupReadContext(unsafeGroupId, {
    includeRemovedMembers: true,
  });
  if (!context) return null;

  const [categories, snapshots] = await Promise.all([
    loadAssetCategories(context),
    loadAssetSnapshots(context),
  ]);
  const members = await loadAssetTrendMembers(context, snapshots);

  return {
    group: { id: context.group.id, name: context.group.name },
    currentMonth: context.currentMonth,
    trend: {
      categories: categories.map(
        ({ version: _version, ...category }) => category,
      ),
      members,
      snapshots: snapshots.map((snapshot) => ({
        month: snapshot.month,
        values: snapshot.values,
      })),
    },
  };
}
