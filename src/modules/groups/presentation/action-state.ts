// グループ作成フォームのuseActionState用の状態
export type GroupActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<
    Record<"name" | "weekStartsOn" | "defaultAllocation", string[]>
  >;
}>;

export const INITIAL_GROUP_ACTION_STATE: GroupActionState = { status: "idle" };
