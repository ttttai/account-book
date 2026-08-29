import type { GroupRole } from "../application/group-types";
import type { GroupMemberSummary } from "../application/member-types";
import {
  getMemberRowActions,
  toMemberAdministrationTarget,
} from "../domain/member-administration-policy";
import { MemberAdministration } from "./member-administration";

const roleLabels = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
} as const;

export function MemberList({
  groupId,
  currentRole,
  members,
}: {
  groupId: string;
  currentRole: GroupRole;
  members: readonly GroupMemberSummary[];
}) {
  const activeOwnerCount = members.filter(
    (member) => member.role === "owner",
  ).length;

  return (
    <section className="member-panel" aria-labelledby="member-list-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">共有中</p>
          <h2 id="member-list-title">メンバー</h2>
        </div>
        <span className="count-badge">{members.length}人</span>
      </div>
      <ul className="member-list">
        {members.map((member) => {
          const actions = getMemberRowActions({
            currentRole,
            targetRole: member.role,
            activeOwnerCount,
          });
          const showAdministration =
            actions.assignableRoles.length > 0 || actions.canRemove;

          return (
            <li
              className={
                showAdministration ? "has-member-administration" : undefined
              }
              key={member.membershipId}
            >
              <span className="member-avatar" aria-hidden="true">
                {member.displayName.slice(0, 1)}
              </span>
              <span className="member-summary">
                <strong>
                  {member.displayName}
                  {member.isCurrentUser && <small>（あなた）</small>}
                </strong>
                <small>{roleLabels[member.role]}</small>
              </span>
              {showAdministration && (
                <MemberAdministration
                  assignableRoles={actions.assignableRoles}
                  canRemove={actions.canRemove}
                  groupId={groupId}
                  target={toMemberAdministrationTarget(member)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
