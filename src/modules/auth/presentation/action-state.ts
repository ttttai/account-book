export type AuthFieldName = "displayName";

export type AuthActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<AuthFieldName, string[]>>;
}>;

export const INITIAL_AUTH_ACTION_STATE: AuthActionState = { status: "idle" };
