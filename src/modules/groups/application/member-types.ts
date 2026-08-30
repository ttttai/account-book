import type { GroupRole, GroupSummary } from "./group-types";

export type InvitationRole = Exclude<GroupRole, "owner">;

export type GroupMemberSummary = Readonly<{
  membershipId: string;
  displayName: string;
  role: GroupRole;
  joinedAt: string;
  isCurrentUser: boolean;
}>;

export type PendingInvitationSummary = Readonly<{
  id: string;
  role: InvitationRole;
  expiresAt: string;
  createdAt: string;
}>;

export type GroupMembershipDetails = Readonly<{
  group: GroupSummary;
  currentRole: GroupRole;
  members: readonly GroupMemberSummary[];
  pendingInvitations: readonly PendingInvitationSummary[];
}>;

export type CreatedInvitation = Readonly<{
  id: string;
  role: InvitationRole;
  expiresAt: string;
  shareUrl: string;
}>;

// 招待受諾の結果。参加成立時のみgroupIdを持つ判別可能union
export type InvitationAcceptanceResult =
  | Readonly<{
      status: "accepted" | "already_accepted";
      groupId: string;
    }>
  | Readonly<{
      status: "not_found" | "expired" | "revoked" | "used";
    }>;
