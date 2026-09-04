// 起動時に開くグループの設定・解除フォームのuseActionState用の状態
export type DefaultGroupActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
}>;

export const INITIAL_DEFAULT_GROUP_ACTION_STATE: DefaultGroupActionState = {
  status: "idle",
};
