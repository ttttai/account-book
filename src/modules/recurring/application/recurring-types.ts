import type {
  RecurringAllocation,
  RecurringTransactionType,
} from "../domain/recurring-schedule";

export type RecurringMemberOption = Readonly<{
  membershipId: string;
  displayName: string;
  isCurrentUser: boolean;
}>;

export type RecurringCategoryOption = Readonly<{
  id: string;
  name: string;
  type: RecurringTransactionType;
  color: string;
}>;

export type RecurringAllocationDetail = Readonly<{
  membershipId: string;
  displayName: string;
  amountMinor: number;
}>;

export type RecurringSummary = Readonly<{
  id: string;
  type: RecurringTransactionType;
  name: string;
  amountMinor: number;
  dayOfMonth: number;
  /** `YYYY-MM` */
  startMonth: string;
  /** `YYYY-MM`。nullは無期限 */
  endMonth: string | null;
  version: number;
  categoryName: string;
  categoryColor: string;
  /** 支出は支払者、収入は受取者の表示名 */
  partyDisplayName: string;
  partyMembershipId: string;
  memo: string | null;
  allocations: readonly RecurringAllocationDetail[];
  /** 現在月時点で終了済みか */
  isEnded: boolean;
}>;

// 定期取引画面が必要とする最小DTO。DB行やユーザーIDをClientへ渡さない
export type RecurringManagementView = Readonly<{
  group: Readonly<{ id: string; name: string }>;
  currentMonth: string;
  canManage: boolean;
  members: readonly RecurringMemberOption[];
  categories: readonly RecurringCategoryOption[];
  recurringTransactions: readonly RecurringSummary[];
}>;

export type RecurringCommandResult =
  | Readonly<{ kind: "ok" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "error" }>;

export type RecurringCommandAllocations = readonly RecurringAllocation[];
