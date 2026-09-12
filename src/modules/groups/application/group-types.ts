export type GroupRole = "owner" | "admin" | "member";

export type GroupSummary = Readonly<{
  membershipId: string;
  id: string;
  name: string;
  currency: "JPY";
  timezone: string;
  weekStartsOn: 0 | 1;
  defaultAllocation: "equal" | "self";
  /** 楽観的ロックの比較値。設定更新ごとに加算される (AC-GRP-013-5) */
  version: number;
  role: GroupRole;
}>;
