import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { RecurringManagement } from "@/modules/recurring/presentation";
import { getRecurringManagement } from "@/modules/recurring/server";

type RecurringTransactionsPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
}>;

// 定期取引画面。閲覧はアクティブメンバー、設定はowner/adminに限る（REC-004）
export default async function RecurringTransactionsPage({
  params,
}: RecurringTransactionsPageProps) {
  const { groupId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/recurring-transactions`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const view = await getRecurringManagement(groupId);
  if (!view) notFound();

  return (
    <main className="protected-shell recurring-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">{view.group.name}</p>
          <h1 className="group-page-title">定期取引</h1>
        </div>
        <Link className="text-link" href={`/groups/${view.group.id}`}>
          ホームへ戻る
        </Link>
      </header>
      <p className="recurring-page-description">
        毎月同じ日・同じ金額の取引を登録すると、開始月から終了月までのホームカレンダーへ「定期」として反映されます。過去に登録した通常の取引は変更されません。
      </p>
      <RecurringManagement view={view} />
    </main>
  );
}
