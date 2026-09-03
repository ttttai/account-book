import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import { getGroupChangeToken } from "@/modules/sync/server";
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

// 認証済みの履歴と変更tokenを読み込み、絞り込み・一覧画面を組み立てる。
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

  // tokenの読み取り後に履歴を読むことで、表示より新しい変更を基準値へ取り込まない。
  const changeState = await getGroupChangeToken(groupId).catch(() => undefined);
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
          <Link className="text-link" href="/app?view=groups">
            グループ一覧
          </Link>
        </nav>
      </header>
      {history.kind === "ready" ? (
        <HistoryView
          data={history}
          syncToken={
            changeState?.kind === "ready" ? changeState.token : undefined
          }
        />
      ) : (
        <HistoryValidationError data={history} />
      )}
    </main>
  );
}
