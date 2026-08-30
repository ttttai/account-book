export type ExpenseFormMember = Readonly<{
  membershipId: string;
  displayName: string;
  isCurrentUser: boolean;
}>;

export type ExpenseFormCategory = Readonly<{
  id: string;
  name: string;
  color: string;
  icon: string;
}>;

export type ExpenseFormOptions = Readonly<{
  group: Readonly<{
    id: string;
    name: string;
    timezone: string;
    defaultAllocation: "equal" | "self";
    currentMembershipId: string;
  }>;
  today: string;
  members: readonly ExpenseFormMember[];
  /** 未アーカイブの支出カテゴリ（並び順どおり） */
  categories: readonly ExpenseFormCategory[];
  /** 未アーカイブの収入カテゴリ（並び順どおり） */
  incomeCategories: readonly ExpenseFormCategory[];
}>;
