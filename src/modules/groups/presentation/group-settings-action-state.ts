// グループ設定変更フォームのuseActionState用の状態
export type GroupSettingsActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<
    Record<"name" | "weekStartsOn" | "defaultAllocation", string[]>
  >;
  /** 成功時に保存された新しいversion。次回送信の比較値に使う (AC-GRP-013-6) */
  version?: number;
}>;

export const INITIAL_GROUP_SETTINGS_ACTION_STATE: GroupSettingsActionState = {
  status: "idle",
};
