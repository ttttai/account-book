// 設定画面で使う週の開始曜日・標準の分け方の表示名。「負担」は表示しない (AC-TXN-018-2)
export const weekStartLabels = {
  0: "日曜日",
  1: "月曜日",
} as const;

export const defaultAllocationLabels = {
  equal: "メンバーで均等",
  self: "自分だけ",
} as const;

// 設定画面へ渡すグループ設定の最小DTO。DB行をそのまま渡さない
export type GroupSettingsView = Readonly<{
  name: string;
  currency: string;
  timezone: string;
  weekStartsOn: 0 | 1;
  defaultAllocation: "equal" | "self";
  version: number;
}>;

// 通貨・タイムゾーンがMVPで固定である理由を示す補足文 (AC-GRP-013-2)
export const FIXED_LOCALE_NOTE =
  "通貨とタイムゾーンは現在JPY・日本時間（Asia/Tokyo）に固定で、変更できません。";
