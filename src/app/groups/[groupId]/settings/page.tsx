import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LogoutForm, ProfileForm } from "@/modules/auth/presentation";
import { getCurrentProfile } from "@/modules/auth/server";
import {
  DefaultGroupForm,
  GroupSettingsForm,
  GroupSettingsSummary,
  type GroupSettingsView,
} from "@/modules/groups/presentation";
import { getDefaultGroupId, getGroupMembership } from "@/modules/groups/server";

type SettingsPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
}>;

const roleLabels = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
} as const;

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { groupId } = await params;
  const [profile, membership, defaultGroupId] = await Promise.all([
    getCurrentProfile(),
    getGroupMembership(groupId),
    getDefaultGroupId(),
  ]);
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/settings`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!membership) notFound();

  const encodedGroupId = encodeURIComponent(membership.group.id);
  const canManageCategories = ["owner", "admin"].includes(
    membership.currentRole,
  );
  // グループ設定の編集はowner/adminだけに提供し、memberには読み取り専用で表示する (AC-GRP-013-1)
  const canEditGroupSettings = canManageCategories;
  const groupSettings: GroupSettingsView = {
    name: membership.group.name,
    currency: membership.group.currency,
    timezone: membership.group.timezone,
    weekStartsOn: membership.group.weekStartsOn,
    defaultAllocation: membership.group.defaultAllocation,
    version: membership.group.version,
  };

  return (
    <main className="protected-shell settings-page">
      <header className="settings-header">
        <div>
          <p className="eyebrow">{membership.group.name}</p>
          <h1 className="group-page-title">設定</h1>
        </div>
        <span className="settings-role">
          {roleLabels[membership.currentRole]}
        </span>
      </header>

      <div className="settings-grid">
        <section className="settings-panel">
          <p className="eyebrow">アカウント</p>
          <h2>プロフィール</h2>
          <ProfileForm displayName={profile.displayName} />
          <DefaultGroupForm
            groupId={membership.group.id}
            isDefault={defaultGroupId === membership.group.id}
          />
          <Link className="settings-row-link" href="/app?view=groups">
            <span>
              <strong>グループを切り替える・作る</strong>
              <small>参加中グループと新規作成を管理します</small>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </section>

        <section className="settings-panel">
          <p className="eyebrow">共有とデータ</p>
          <h2>グループ管理</h2>
          <nav className="settings-link-list" aria-label="グループ設定項目">
            <Link
              className="settings-row-link"
              href={`/groups/${encodedGroupId}/members`}
            >
              <span>
                <strong>メンバー</strong>
                <small>一覧、招待、権限を管理します</small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
            {canManageCategories ? (
              <Link
                className="settings-row-link"
                href={`/groups/${encodedGroupId}/categories`}
              >
                <span>
                  <strong>カテゴリ</strong>
                  <small>入力候補と並び順を管理します</small>
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            ) : null}
            <Link
              className="settings-row-link"
              href={`/groups/${encodedGroupId}/recurring-transactions`}
            >
              <span>
                <strong>固定費</strong>
                <small>毎月同じ日・同じ金額の取引を管理します</small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
            <Link
              className="settings-row-link"
              href={`/groups/${encodedGroupId}/budgets`}
            >
              <span>
                <strong>予算</strong>
                <small>月間予算とカテゴリ予算の進捗を確認します</small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
            <a
              className="settings-row-link"
              href={`/api/v1/groups/${encodedGroupId}/exports/transactions.csv`}
            >
              <span>
                <strong>CSV出力</strong>
                <small>閲覧可能な取引をダウンロードします</small>
              </span>
              <span aria-hidden="true">↓</span>
            </a>
          </nav>
        </section>

        <section className="settings-panel settings-summary-panel">
          <p className="eyebrow">グループ設定</p>
          <h2 id="group-settings-title">
            {canEditGroupSettings ? "名前と標準の設定" : membership.group.name}
          </h2>
          {canEditGroupSettings ? (
            <GroupSettingsForm
              groupId={membership.group.id}
              settings={groupSettings}
            />
          ) : (
            <GroupSettingsSummary settings={groupSettings} />
          )}
        </section>

        <section className="settings-panel settings-session-panel">
          <div>
            <p className="eyebrow">セッション</p>
            <h2>ログアウト</h2>
          </div>
          <LogoutForm />
        </section>
      </div>
    </main>
  );
}
