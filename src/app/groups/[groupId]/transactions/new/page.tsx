import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { ExpenseForm } from "@/modules/transactions/presentation";
import { getExpenseFormOptions } from "@/modules/transactions/server";

type NewExpensePageProps = Readonly<{
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}>;

// 支出登録画面。表示ごとにclientRequestIdを発行し、二重送信時の重複登録を防ぐ
export default async function NewExpensePage({
  params,
  searchParams,
}: NewExpensePageProps) {
  const [{ groupId }, search] = await Promise.all([params, searchParams]);
  const profile = await getCurrentProfile();
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/transactions/new`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const options = await getExpenseFormOptions(groupId, search.date);
  if (!options || options.categories.length === 0) notFound();

  return (
    <main className="protected-shell expense-page">
      <header className="app-header expense-header">
        <div>
          <p className="eyebrow">{options.group.name}</p>
          <h1 className="group-page-title">取引を追加</h1>
        </div>
        <Link className="text-link" href={`/groups/${options.group.id}`}>
          キャンセル
        </Link>
      </header>
      <ExpenseForm clientRequestId={randomUUID()} options={options} />
    </main>
  );
}
