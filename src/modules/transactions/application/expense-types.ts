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
  categories: readonly ExpenseFormCategory[];
}>;
