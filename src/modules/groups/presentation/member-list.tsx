import type { GroupMemberSummary } from "../application/member-types";

const roleLabels = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
} as const;

// グループメンバーの一覧を役割ラベル付きで表示する
export function MemberList({
  members,
}: {
  members: readonly GroupMemberSummary[];
}) {
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
        {members.map((member) => (
          <li key={member.membershipId}>
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
          </li>
        ))}
      </ul>
    </section>
  );
}
