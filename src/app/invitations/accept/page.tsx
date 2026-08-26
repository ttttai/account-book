import Link from "next/link";

import { getCurrentProfile } from "@/modules/auth/server";
import { InvitationAcceptance } from "@/modules/groups/presentation";

export default async function InvitationAcceptancePage() {
  const profile = await getCurrentProfile();

  return (
    <main className="auth-page">
      <section className="auth-card invitation-acceptance-card">
        <Link className="brand-link" href="/">
          わが家計
        </Link>
        <p className="eyebrow">グループへの招待</p>
        <h1>家計を共有する</h1>
        <p className="auth-introduction">
          招待内容を確認して、共有家計へ参加します。
        </p>
        <InvitationAcceptance isAuthenticated={profile !== null} />
      </section>
    </main>
  );
}
