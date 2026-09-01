export type RecurringFieldName =
  | "name"
  | "amountMinor"
  | "dayOfMonth"
  | "startMonth"
  | "endMonth"
  | "categoryId"
  | "partyMemberId"
  | "allocationMethod"
  | "memo";

export type RecurringActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<RecurringFieldName, string[]>>;
}>;

export const initialRecurringActionState: RecurringActionState = {
  status: "idle",
};
