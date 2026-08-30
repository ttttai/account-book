export type AuthFieldName = "displayName";

// フォーム送信結果の状態（未送信・エラー・成功）とメッセージを表す
export type AuthActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<AuthFieldName, string[]>>;
}>;

export const INITIAL_AUTH_ACTION_STATE: AuthActionState = { status: "idle" };
