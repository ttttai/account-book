import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { LogoutForm, ProfileForm } from "@/modules/auth/presentation";
import { CreateGroupForm, GroupList } from "@/modules/groups/presentation";
import { listMyGroups } from "@/modules/groups/server";

// ログイン後のホーム画面（プロフィール編集と所属グループの一覧・作成）
export default async function ProtectedAppPage() {
  const [profile, groups] = await Promise.all([
    getCurrentProfile(),
    listMyGroups(),
  ]);
  if (!profile) redirect("/login");

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
