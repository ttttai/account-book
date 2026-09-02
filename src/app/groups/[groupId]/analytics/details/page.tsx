import { notFound, redirect } from "next/navigation";

import {
  AnalyticsDetails,
  AnalyticsDetailsValidationError,
} from "@/modules/analytics/presentation";
import {
  type AnalyticsDetailsSearchInput,
  getAnalyticsDetails,
} from "@/modules/analytics/server";
import { getCurrentProfile } from "@/modules/auth/server";

type AnalyticsDetailsPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
  searchParams: Promise<AnalyticsDetailsSearchInput>;
}>;

// 最大24か月の期間指標・推移・カテゴリ・メンバー比較を表示する詳細分析画面
export default async function AnalyticsDetailsPage({
  params,
  searchParams,
}: AnalyticsDetailsPageProps) {
  const [{ groupId }, search, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentProfile(),
  ]);
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/analytics/details`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const details = await getAnalyticsDetails(groupId, search);
  if (!details) notFound();
  const groupName =
    details.kind === "ready" ? details.group.name : "家計グループ";

  return (
    <main className="protected-shell analytics-page">
      <header className="analytics-page-header">
        <p className="eyebrow">分析</p>
        <h1 className="group-page-title">{groupName}</h1>
      </header>
      {details.kind === "ready" ? (
        <AnalyticsDetails data={details} />
      ) : (
        <AnalyticsDetailsValidationError data={details} />
      )}
    </main>
  );
}
