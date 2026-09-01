import { notFound, redirect } from "next/navigation";

import {
  AnalyticsOverview,
  AnalyticsValidationError,
} from "@/modules/analytics/presentation";
import {
  type AnalyticsSearchInput,
  getAnalyticsOverview,
} from "@/modules/analytics/server";
import { getCurrentProfile } from "@/modules/auth/server";

type AnalyticsPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
  searchParams: Promise<AnalyticsSearchInput>;
}>;

// 概要分析画面。選択月の支出・収入・収支と前月比較、支出カテゴリ内訳を表示する (ANA-001〜ANA-005)
export default async function AnalyticsPage({
  params,
  searchParams,
}: AnalyticsPageProps) {
  const [{ groupId }, search, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentProfile(),
  ]);
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/analytics`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const analytics = await getAnalyticsOverview(groupId, search);
  if (!analytics) notFound();
  const groupName =
    analytics.kind === "ready" ? analytics.group.name : "家計グループ";

  return (
    <main className="protected-shell analytics-page">
      <header className="analytics-page-header">
        <p className="eyebrow">分析</p>
        <h1 className="group-page-title">{groupName}</h1>
      </header>
      {analytics.kind === "ready" ? (
        <AnalyticsOverview data={analytics} />
      ) : (
        <AnalyticsValidationError data={analytics} />
      )}
    </main>
  );
}
