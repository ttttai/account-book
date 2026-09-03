import Link from "next/link";

import type { GroupSummary } from "../application/group-types";

import styles from "./groups.module.css";

const roleLabels = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
} as const;

type GroupListProps = Readonly<{
  groups: readonly GroupSummary[];
  /** 本人が設定した起動時に開くグループID。該当行にだけ表示を付ける (AC-GRP-012-5) */
  defaultGroupId: string | null;
}>;

// 参加中グループの一覧。0件のときは何も描画しない
export function GroupList({ groups, defaultGroupId }: GroupListProps) {
  if (groups.length === 0) return null;

  return (
    <section
      className={styles["group-list-panel"]}
      aria-labelledby="group-list-title"
    >
      <h1 id="group-list-title">家計グループ</h1>
      <ul className={styles["group-list"]}>
        {groups.map((group) => (
          <li key={group.membershipId}>
            <Link href={`/groups/${group.id}`}>
              <span className={styles["group-list-name"]}>
                <span>{group.name}</span>
                {group.id === defaultGroupId ? (
                  <span className={styles["group-list-badge"]}>
                    起動時に開く
                  </span>
                ) : null}
              </span>
              <small>{roleLabels[group.role]}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
