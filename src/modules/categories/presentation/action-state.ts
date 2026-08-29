export type CategoryActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Readonly<{ name?: readonly string[] }>;
}>;

export const INITIAL_CATEGORY_ACTION_STATE: CategoryActionState = {
  status: "idle",
};
