import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createAssetRecordUrl } from "@/modules/assets";
import { AssetTrendScreen } from "@/modules/assets/presentation";
import { getAssetTrend } from "@/modules/assets/server";
import { getCurrentProfile } from "@/modules/auth/server";

type AssetsPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
}>;

// 資産推移画面。閲覧はアクティブメンバー全員、切替はClient Componentのローカル状態で行う (AST-001、AST-007〜AST-010)
export default async function AssetsPage({ params }: AssetsPageProps) {
  const [{ groupId }, profile] = await Promise.all([
    params,
    getCurrentProfile(),
  ]);
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/assets`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const data = await getAssetTrend(groupId);
  if (!data) notFound();

  return (
    <main className="protected-shell asset-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">{data.group.name}</p>
          <h1 className="group-page-title">資産推移</h1>
        </div>
        <Link
          className="primary-link"
          href={createAssetRecordUrl(data.group.id)}
        >
          資産を記録
        </Link>
      </header>
      <AssetTrendScreen data={data} />
    </main>
  );
}
