import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AssetRecordScreen,
  AssetRecordValidationError,
} from "@/modules/assets/presentation";
import {
  type AssetRecordSearchInput,
  getAssetRecordForm,
} from "@/modules/assets/server";
import { getCurrentProfile } from "@/modules/auth/server";

type AssetRecordPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
  searchParams: Promise<AssetRecordSearchInput>;
}>;

// 資産の記録画面。アクティブメンバーが1か月分の資産額をまとめて保存する (AST-002〜AST-005)
export default async function AssetRecordPage({
  params,
  searchParams,
}: AssetRecordPageProps) {
  const [{ groupId }, search, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentProfile(),
  ]);
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/assets/record`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const view = await getAssetRecordForm(groupId, search);
  if (!view) notFound();
  const encodedGroupId = encodeURIComponent(
    view.kind === "ready" ? view.group.id : view.groupId,
  );

  return (
    <main className="protected-shell asset-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">
            {view.kind === "ready" ? view.group.name : "家計グループ"}
          </p>
          <h1 className="group-page-title">資産を記録</h1>
        </div>
        <Link className="text-link" href={`/groups/${encodedGroupId}/assets`}>
          資産推移へ
        </Link>
      </header>
      {view.kind === "ready" ? (
        <AssetRecordScreen view={view} />
      ) : (
        <AssetRecordValidationError data={view} />
      )}
    </main>
  );
}
