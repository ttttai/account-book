import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import {
  CalendarHome,
  CalendarValidationError,
} from "@/modules/calendar/presentation";
import {
  getGroupCalendar,
  type CalendarSearchInput,
} from "@/modules/calendar/server";

type GroupPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
  searchParams: Promise<CalendarSearchInput>;
}>;

export default async function GroupPage({
  params,
  searchParams,
}: GroupPageProps) {
  const [{ groupId }, search, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentProfile(),
  ]);
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const calendar = await getGroupCalendar(groupId, search);
  if (!calendar) notFound();
  const groupName =
    calendar.kind === "ready" ? calendar.group.name : "家計グループ";

  return (
    <main className="protected-shell group-home calendar-home-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">家計グループ</p>
          <h1 className="group-page-title">{groupName}</h1>
        </div>
        <nav className="header-links" aria-label="グループ操作">
          <Link
            className="text-link"
            href={`/groups/${encodeURIComponent(groupId)}/members`}
          >
            メンバー
          </Link>
          <Link className="text-link" href="/app">
            グループ一覧
          </Link>
        </nav>
      </header>
      <div className="group-primary-actions">
        <Link
          className="primary-link"
          href={`/groups/${encodeURIComponent(groupId)}/transactions/new`}
        >
          支出を追加
        </Link>
      </div>
      {calendar.kind === "ready" ? (
        <CalendarHome data={calendar} />
      ) : (
        <CalendarValidationError data={calendar} />
      )}
    </main>
  );
}
