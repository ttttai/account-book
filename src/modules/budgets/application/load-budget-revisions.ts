import "server-only";

import { z } from "zod";

import type { createServerSupabaseClient } from "@/modules/auth/server";
import type { GroupReadContext } from "@/modules/groups/server";

import {
  type BudgetRevision,
  monthToFirstDay,
} from "../domain/budget-revision";
import {
  BUDGET_REVISION_SELECT_COLUMNS,
  budgetRevisionRowSchema,
  toBudgetRevision,
} from "./budget-row";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

// グループの予算改定を新しい開始月から順に全件読む。RLSでアクティブメンバーだけがselectできる
export async function loadBudgetRevisions(
  supabase: ServerSupabaseClient,
  groupId: string,
): Promise<readonly BudgetRevision[]> {
  const { data, error } = await supabase
    .from("budget_revisions")
    .select(BUDGET_REVISION_SELECT_COLUMNS)
    .eq("group_id", groupId)
    .order("effective_month", { ascending: false });

  if (error) throw new Error("予算を取得できませんでした。");

  return z
    .array(budgetRevisionRowSchema)
    .parse(data ?? [])
    .map(toBudgetRevision);
}

// 分析概要などが選択月の予算進捗を作るための共有読み取り。対象月以前で最新の改定1件を返す (BUD-010)
// 認可は呼び出し側のcontextで確認済みとし、RLS適用のユーザーsession clientで読む
export async function loadAppliedBudgetRevision(
  context: GroupReadContext,
  month: string,
): Promise<BudgetRevision | null> {
  const { data, error } = await context.supabase
    .from("budget_revisions")
    .select(BUDGET_REVISION_SELECT_COLUMNS)
    .eq("group_id", context.group.id)
    .lte("effective_month", monthToFirstDay(month))
    .order("effective_month", { ascending: false })
    .limit(1);

  if (error) throw new Error("予算を取得できませんでした。");

  const rows = z.array(budgetRevisionRowSchema).parse(data ?? []);
  const row = rows[0];
  return row ? toBudgetRevision(row) : null;
}
