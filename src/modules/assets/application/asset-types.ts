import type { CategoryColor } from "@/modules/categories";

import type { AssetTrendData } from "../domain/asset-trend";

// 資産推移画面の最小DTO。DB行・ユーザーID・tokenをClientへ渡さない (AST-001)
export type AssetTrendScreenData = Readonly<{
  group: Readonly<{ id: string; name: string }>;
  /** グループのタイムゾーン上の当月（`YYYY-MM`） */
  currentMonth: string;
  trend: AssetTrendData;
}>;

export type AssetRecordMember = Readonly<{
  memberId: string;
  displayName: string;
  isCurrentUser: boolean;
}>;

export type AssetRecordCategory = Readonly<{
  id: string;
  name: string;
  color: CategoryColor;
}>;

export type AssetRecordSearchInput = Readonly<{
  month?: string | string[];
}>;

// 記録画面の最小DTO。入力欄はアクティブメンバー × アクティブ資産区分だけ (AC-AST-002-1)
export type AssetRecordFormReady = Readonly<{
  kind: "ready";
  group: Readonly<{ id: string; name: string }>;
  month: string;
  /** 2000-01より前へは移動できないためnull */
  previousMonth: string | null;
  /** 当月より後へは移動できないためnull (AC-AST-003-2) */
  nextMonth: string | null;
  currentMonth: string;
  /** 自分を先頭に、アクティブメンバーを参加順で並べる */
  members: readonly AssetRecordMember[];
  categories: readonly AssetRecordCategory[];
  /** `memberId:categoryId`ごとの初期値（区切りなしの数字。0円は空欄） */
  initialValues: Readonly<Record<string, string>>;
  /** コピー元の記録月 (AC-AST-003-1) */
  copiedFrom: string | null;
  existing: Readonly<{
    version: number;
    updatedByName: string | null;
    /** UTCのISO文字列 */
    updatedAt: string;
  }> | null;
  canManageCategories: boolean;
}>;

export type AssetRecordFormInvalid = Readonly<{
  kind: "invalid";
  groupId: string;
  currentMonth: string;
}>;

export type AssetRecordForm = AssetRecordFormReady | AssetRecordFormInvalid;

export type AssetCategorySetting = Readonly<{
  id: string;
  name: string;
  color: CategoryColor;
  version: number;
}>;

export type AssetCategorySettingsData = Readonly<{
  group: Readonly<{ id: string; name: string }>;
  active: readonly AssetCategorySetting[];
  archived: readonly AssetCategorySetting[];
}>;

// 資産区分の管理画面。memberには資産区分データを返さない (AC-AST-006-1)
export type AssetCategorySettingsView =
  | Readonly<{ kind: "ready"; data: AssetCategorySettingsData }>
  | Readonly<{ kind: "forbidden"; groupId: string }>;

export type AssetCommandResult =
  | Readonly<{ kind: "ok" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "duplicate" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "error" }>;
