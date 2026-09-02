import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { resolveEditReturnPath } from "@/modules/transactions";
import {
  DeleteTransactionForm,
  ExpenseForm,
} from "@/modules/transactions/presentation";
import { getExpenseForEdit } from "@/modules/transactions/server";

type EditExpensePageProps = Readonly<{
  params: Promise<{ groupId: string; transactionId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}>;

const yenFormatter = new Intl.NumberFormat("ja-JP");

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

// 取引（支出・収入）編集画面。保存済みの内容を初期表示し、楽観的ロック付きの更新と削除を提供する
export default async function EditExpensePage({
  params,
  searchParams,
}: EditExpensePageProps) {
  const [{ groupId, transactionId }, search] = await Promise.all([
    params,
    searchParams,
  ]);
  const profile = await getCurrentProfile();
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/transactions/${encodeURIComponent(transactionId)}/edit`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const data = await getExpenseForEdit(groupId, transactionId);
  if (!data) notFound();

  const returnTo = resolveEditReturnPath(
    typeof search.from === "string" ? search.from : undefined,
    data.options.group.id,
  );
  const summary = `${formatDate(data.transaction.transactionDate)}・￥${yenFormatter.format(
    data.transaction.amountMinor,
  )}`;

  return (
    <main className="protected-shell expense-page">
      <header className="app-header expense-header">
        <div>
          <p className="eyebrow">{data.options.group.name}</p>
          <h1 className="group-page-title">
            {data.transaction.type === "income" ? "収入を編集" : "支出を編集"}
          </h1>
        </div>
        <Link className="text-link" href={returnTo}>
          キャンセル
        </Link>
      </header>
      <ExpenseForm
        edit={{ transaction: data.transaction, returnTo }}
        footer={
          <DeleteTransactionForm
            expectedVersion={data.transaction.version}
            groupId={data.options.group.id}
            returnTo={returnTo}
            summary={summary}
            transactionId={data.transaction.id}
          />
        }
        options={data.options}
      />
    </main>
  );
}
