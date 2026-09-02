import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { LogoutForm, ProfileForm } from "@/modules/auth/presentation";
import { CreateGroupForm, GroupList } from "@/modules/groups/presentation";
import { listMyGroups, resolveHomeDestination } from "@/modules/groups/server";

type ProtectedAppPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

// ログイン後のホーム画面（プロフィール編集と所属グループの一覧・作成）。所属が1件だけならカレンダーへ直行する (GRP-011)
export default async function ProtectedAppPage({
  searchParams,
}: ProtectedAppPageProps) {
  const [profile, groups, search] = await Promise.all([
    getCurrentProfile(),
    listMyGroups(),
    searchParams,
  ]);
  if (!profile) redirect("/login");

  // 遷移先はサーバーが取得した所属だけから決め、view=groupsのときだけ一覧を表示する (AC-GRP-011-1, AC-GRP-011-3, AC-GRP-011-4)
  const destination = resolveHomeDestination({
    groupIds: groups.map((group) => group.id),
    view: search.view,
  });
  if (destination.kind === "group") redirect(destination.href);

  return (
    <main className="protected-shell groups-overview">
      <header className="app-header">
        <div>
          <p className="eyebrow">わが家計</p>
          <p className="profile-name">{profile.displayName}</p>
        </div>
        <LogoutForm />
      </header>
      <section className="profile-panel" aria-labelledby="profile-title">
        <h1 id="profile-title">プロフィール</h1>
        <ProfileForm displayName={profile.displayName} />
      </section>
      <GroupList groups={groups} />
      <section className="empty-panel" aria-labelledby="create-group-title">
        <p className="empty-icon" aria-hidden="true">
          家
        </p>
        <h2 id="create-group-title">
          {groups.length === 0
            ? "最初の家計グループを作りましょう"
            : "別のグループを作成"}
        </h2>
        <p>家庭や旅行など、記録を分けたい単位で複数作成できます。</p>
        <CreateGroupForm />
      </section>
    </main>
  );
}
