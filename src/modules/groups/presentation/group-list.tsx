import Link from "next/link";

import type { GroupSummary } from "../application/group-types";

const roleLabels = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
} as const;

export function GroupList({ groups }: { groups: readonly GroupSummary[] }) {
  if (groups.length === 0) return null;

  return (
    <section className="group-list-panel" aria-labelledby="group-list-title">
      <h1 id="group-list-title">家計グループ</h1>
      <ul className="group-list">
        {groups.map((group) => (
          <li key={group.membershipId}>
            <Link href={`/groups/${group.id}`}>
              <span>{group.name}</span>
              <small>{roleLabels[group.role]}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
