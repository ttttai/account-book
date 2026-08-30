import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import {
  HistoryValidationError,
  HistoryView,
} from "@/modules/history/presentation";
import {
  getGroupHistory,
  type HistorySearchInput,
} from "@/modules/history/server";

type GroupHistoryPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
  searchParams: Promise<HistorySearchInput>;
}>;

export default async function GroupHistoryPage({
  params,
  searchParams,
}: GroupHistoryPageProps) {
  const [{ groupId }, search, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentProfile(),
  ]);
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/history`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const history = await getGroupHistory(groupId, search);
  if (!history) notFound();
  const groupName =
    history.kind === "ready" ? history.group.name : "家計グループ";

  return (
    <main className="protected-shell group-home history-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">取引履歴</p>
          <h1 className="group-page-title">{groupName}</h1>
        </div>
        <nav className="header-links" aria-label="履歴画面の操作">
          <Link
            className="text-link"
            href={`/groups/${encodeURIComponent(groupId)}`}
          >
            ホーム
          </Link>
          <Link className="text-link" href="/app">
            グループ一覧
          </Link>
        </nav>
      </header>
      {history.kind === "ready" ? (
        <HistoryView data={history} />
      ) : (
        <HistoryValidationError data={history} />
      )}
    </main>
  );
}
