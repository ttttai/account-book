import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { RecoverableTransactionList } from "@/modules/transactions/presentation";
import { listRecoverableTransactions } from "@/modules/transactions/server";

type DeletedTransactionsPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ restored?: string | string[] }>;
}>;

// 削除済み取引の復元画面。削除から30日以内の取引を一覧し、行ごとの復元操作を提供する
export default async function DeletedTransactionsPage({
  params,
  searchParams,
}: DeletedTransactionsPageProps) {
  const [{ groupId }, search] = await Promise.all([params, searchParams]);
  const profile = await getCurrentProfile();
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/transactions/deleted`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const transactions = await listRecoverableTransactions(groupId);
  if (transactions === null) notFound();

  const encodedGroupId = encodeURIComponent(groupId);

  return (
    <main className="protected-shell deleted-transactions-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">設定</p>
          <h1 className="group-page-title">削除済み取引の復元</h1>
        </div>
        <Link className="text-link" href={`/groups/${encodedGroupId}/settings`}>
          設定へ戻る
        </Link>
      </header>
      {search.restored === "1" && (
        <p className="form-message success" role="status">
          取引を復元しました。カレンダーと履歴の合計へ戻っています。
        </p>
      )}
      <RecoverableTransactionList
        groupId={groupId}
        transactions={transactions}
      />
    </main>
  );
}
