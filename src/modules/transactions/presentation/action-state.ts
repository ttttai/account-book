export type ExpenseActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, readonly string[] | undefined>>;
}>;

export const INITIAL_EXPENSE_ACTION_STATE: ExpenseActionState = {
  status: "idle",
};
