import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AssetCategorySettings } from "@/modules/assets/presentation";
import { getAssetCategorySettings } from "@/modules/assets/server";
import { getCurrentProfile } from "@/modules/auth/server";

type AssetCategoriesPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
}>;

// 資産区分の管理画面。owner/adminだけが開け、memberには資産区分データを返さない (AST-006)
export default async function AssetCategoriesPage({
  params,
}: AssetCategoriesPageProps) {
  const { groupId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/asset-categories`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const view = await getAssetCategorySettings(groupId);
  if (!view) notFound();

  if (view.kind === "forbidden") {
    return (
      <main className="protected-shell asset-page">
        <section className="empty-panel" role="alert">
          <p aria-hidden="true" className="empty-icon">
            !
          </p>
          <h1>資産区分を管理する権限がありません</h1>
          <p>
            資産区分の追加・変更はオーナーまたは管理者だけが行えます。必要な場合はグループのオーナーへ依頼してください。
          </p>
          <Link
            className="primary-link"
            href={`/groups/${encodeURIComponent(view.groupId)}/settings`}
          >
            設定へ戻る
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="protected-shell asset-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">{view.data.group.name}</p>
          <h1 className="group-page-title">資産区分</h1>
        </div>
        <Link
          className="text-link"
          href={`/groups/${encodeURIComponent(view.data.group.id)}/settings`}
        >
          設定へ戻る
        </Link>
      </header>
      <p className="category-page-description">
        削除した区分は記録画面の入力欄に表示されません。過去の資産記録の表示と合計は変わりません。
      </p>
      <AssetCategorySettings data={view.data} />
    </main>
  );
}
