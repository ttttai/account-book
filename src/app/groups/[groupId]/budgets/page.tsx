import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/modules/auth/server";
import {
  BudgetScreen,
  BudgetValidationError,
} from "@/modules/budgets/presentation";
import {
  type BudgetSearchInput,
  getGroupBudget,
} from "@/modules/budgets/server";

type BudgetsPageProps = Readonly<{
  params: Promise<{ groupId: string }>;
  searchParams: Promise<BudgetSearchInput>;
}>;

// 予算画面。閲覧はアクティブメンバー、設定・改定・停止はowner/adminに限る (BUD-001〜BUD-010)
export default async function BudgetsPage({
  params,
  searchParams,
}: BudgetsPageProps) {
  const [{ groupId }, search, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentProfile(),
  ]);
  if (!profile) {
    const nextPath = `/groups/${encodeURIComponent(groupId)}/budgets`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const view = await getGroupBudget(groupId, search);
  if (!view) notFound();
  const groupName = view.kind === "ready" ? view.group.name : "家計グループ";

  return (
    <main className="protected-shell budget-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">{groupName}</p>
          <h1 className="group-page-title">予算</h1>
        </div>
      </header>
      {view.kind === "ready" ? (
        <BudgetScreen view={view} />
      ) : (
        <BudgetValidationError data={view} />
      )}
    </main>
  );
}
