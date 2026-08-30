import type { CategorySummary } from "../domain/category-summary";

export type CategoryManagementData = Readonly<{
  group: Readonly<{ id: string; name: string }>;
  currentRole: "owner" | "admin";
  expenseCategories: readonly CategorySummary[];
  incomeCategories: readonly CategorySummary[];
}>;

export type CategoryManagementView =
  | Readonly<{ kind: "authorized"; data: CategoryManagementData }>
  | Readonly<{ kind: "forbidden" }>;

export type { CategorySummary };
