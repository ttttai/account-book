import type { GroupRole } from "../application/group-types";
import type { GroupMemberSummary } from "../application/member-types";

const GROUP_ROLES: readonly GroupRole[] = ["owner", "admin", "member"];

export type MemberAdministrationTarget = Readonly<{
  membershipId: string;
  displayName: string;
  role: GroupRole;
}>;

export type MemberRowActions = Readonly<{
  assignableRoles: readonly GroupRole[];
  canRemove: boolean;
}>;

const NO_ACTIONS: MemberRowActions = { assignableRoles: [], canRemove: false };

export function canAdministerMembers(currentRole: unknown): boolean {
  return currentRole === "owner";
}

export function getMemberRowActions(input: {
  currentRole: unknown;
  targetRole: GroupRole;
  activeOwnerCount: number;
}): MemberRowActions {
  if (!canAdministerMembers(input.currentRole)) return NO_ACTIONS;

  const targetIsLastOwner =
    input.targetRole === "owner" && input.activeOwnerCount <= 1;
  if (targetIsLastOwner) return NO_ACTIONS;

  return {
    assignableRoles: GROUP_ROLES.filter((role) => role !== input.targetRole),
    canRemove: input.targetRole !== "owner",
  };
}

export function toMemberAdministrationTarget(
  member: GroupMemberSummary,
): MemberAdministrationTarget {
  return {
    membershipId: member.membershipId,
    displayName: member.displayName,
    role: member.role,
  };
}
