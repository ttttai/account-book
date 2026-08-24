import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { LogoutForm, ProfileForm } from "@/modules/auth/presentation";

export default async function ProtectedAppPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <main className="protected-shell">
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
      <section className="empty-panel" aria-labelledby="groups-title">
        <p className="empty-icon" aria-hidden="true">
          家
        </p>
        <h2 id="groups-title">家計グループを作りましょう</h2>
        <p>次の実装段階で、グループ作成と家族の招待が使えるようになります。</p>
        <button className="primary-button" disabled type="button">
          グループを作成
        </button>
      </section>
    </main>
  );
}
