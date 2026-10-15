import "server-only";

import { resolveGroupReadContext } from "@/modules/groups/server";

import type { AssetCategorySettingsView } from "./asset-types";
import { loadAssetCategories, loadCurrentRole } from "./load-asset-data";

// 資産区分の管理画面のDTO。owner/adminだけに資産区分を返し、memberは権限不足にする (AC-AST-006-1)
export async function getAssetCategorySettings(
  unsafeGroupId: string,
): Promise<AssetCategorySettingsView | null> {
  const context = await resolveGroupReadContext(unsafeGroupId);
  if (!context) return null;

  const role = await loadCurrentRole(context);
  if (role === "member") {
    return { kind: "forbidden", groupId: context.group.id };
  }

  const categories = await loadAssetCategories(context);
  const toSetting = (category: (typeof categories)[number]) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    version: category.version,
  });
  return {
    kind: "ready",
    data: {
      group: { id: context.group.id, name: context.group.name },
      active: categories
        .filter((category) => !category.archived)
        .map(toSetting),
      archived: categories
        .filter((category) => category.archived)
        .map(toSetting),
    },
  };
}
