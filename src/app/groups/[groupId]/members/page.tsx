import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import {
  InvitationManagement,
  MemberList,
} from "@/modules/groups/presentation";
import { getGroupMembership } from "@/modules/groups/server";

type MembersPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
}>;

export default async function MembersPage({ params }: MembersPageProps) {
  const { groupId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/members`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const membership = await getGroupMembership(groupId);
  if (!membership) notFound();

  const canManageInvitations = ["owner", "admin"].includes(
    membership.currentRole,
  );

  return (
    <main className="protected-shell member-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">{membership.group.name}</p>
          <h1 className="group-page-title">メンバー</h1>
        </div>
        <Link className="text-link" href={`/groups/${membership.group.id}`}>
          ホームへ戻る
        </Link>
      </header>
      <div className="member-page-grid">
        <MemberList members={membership.members} />
        {canManageInvitations ? (
          <InvitationManagement
            groupId={membership.group.id}
            invitations={membership.pendingInvitations}
          />
        ) : (
          <section className="member-info-panel">
            <h2>グループへの招待</h2>
            <p>招待リンクはオーナーまたは管理者が作成できます。</p>
          </section>
        )}
      </div>
    </main>
  );
}
