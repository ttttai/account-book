import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { CategoryManagement } from "@/modules/categories/presentation";
import { getCategoryManagement } from "@/modules/categories/server";

type CategoriesPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
}>;

export default async function CategoriesPage({ params }: CategoriesPageProps) {
  const { groupId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/categories`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const view = await getCategoryManagement(groupId);
  if (!view) notFound();

  if (view.kind === "forbidden") {
    return (
      <main className="protected-shell category-page">
        <section className="empty-panel" role="alert">
          <p aria-hidden="true" className="empty-icon">
            !
          </p>
          <h1>カテゴリを管理する権限がありません</h1>
          <p>
            カテゴリの追加・変更はオーナーまたは管理者だけが行えます。必要な場合はグループのオーナーへ依頼してください。
          </p>
          <Link
            className="primary-link"
            href={`/groups/${encodeURIComponent(groupId)}`}
          >
            グループホームへ戻る
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="protected-shell category-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">{view.data.group.name}</p>
          <h1 className="group-page-title">カテゴリ管理</h1>
        </div>
        <Link className="text-link" href={`/groups/${view.data.group.id}`}>
          ホームへ戻る
        </Link>
      </header>
      <p className="category-page-description">
        アーカイブしたカテゴリは一覧と新規取引の選択肢に表示されません。過去の取引の表示は変わりません。
      </p>
      <CategoryManagement
        expenseCategories={view.data.expenseCategories}
        groupId={view.data.group.id}
        incomeCategories={view.data.incomeCategories}
      />
    </main>
  );
}
