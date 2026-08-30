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
      <header className="calendar-home-header">
        <p className="eyebrow">ホーム</p>
        <h1 className="group-page-title">{groupName}</h1>
      </header>
      {calendar.kind === "ready" ? (
        <CalendarHome data={calendar} />
      ) : (
        <CalendarValidationError data={calendar} />
      )}
    </main>
  );
}
