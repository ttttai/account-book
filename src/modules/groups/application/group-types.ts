export type GroupRole = "owner" | "admin" | "member";

export type GroupSummary = Readonly<{
  membershipId: string;
  id: string;
  name: string;
  currency: "JPY";
  timezone: string;
  weekStartsOn: 0 | 1;
  defaultAllocation: "equal" | "self";
  role: GroupRole;
}>;
