export type BudgetFieldName =
  "effectiveMonth" | "totalAmountMinor" | "categoryLimits";

export type BudgetActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<BudgetFieldName, string[]>>;
}>;

export const initialBudgetActionState: BudgetActionState = { status: "idle" };
