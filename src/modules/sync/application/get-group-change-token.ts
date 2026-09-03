import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";
import {
  type GroupReadContext,
  resolveGroupReadContext,
} from "@/modules/groups/server";

import { buildChangeToken, type ChangeAggregate } from "../domain/change-token";
import type { GroupChangeTokenResult } from "./change-token-types";

// 変更tokenの材料にするテーブル。メンバー・グループ設定は対象外（仕様16 §4.1）
const CHANGE_SOURCES = [
  "transactions",
  "recurring_transactions",
  "categories",
] as const;

type ChangeSource = (typeof CHANGE_SOURCES)[number];

const updatedAtRowSchema = z.object({ updated_at: z.string() });

// 所属確認がnullのとき、未認証と非メンバーを区別する。グループの存在は明かさない
async function classifyDenied(): Promise<GroupChangeTokenResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = getAllowedGoogleUserId(data?.claims);
  return error || !userId ? { kind: "unauthenticated" } : { kind: "not_found" };
}

// 1テーブルの行数とupdated_at最大値だけを読む。取引行の本体・金額・メモは読まない (NFR-PERF-007)
async function readAggregate(
  context: GroupReadContext,
  table: ChangeSource,
): Promise<ChangeAggregate> {
  const { data, error, count } = await context.supabase
    .from(table)
    .select("updated_at", { count: "exact" })
    .eq("group_id", context.group.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("変更を確認できませんでした。");

  const rows = z.array(updatedAtRowSchema).parse(data ?? []);
  return {
    table,
    rowCount: count ?? rows.length,
    latestUpdatedAt: rows[0]?.updated_at ?? null,
  };
}

// 認証・所属を毎回確認し、グループ所有データの変更tokenを返す。未認証・非メンバー・不正IDへtokenを返さない (SYNC-003)
export async function getGroupChangeToken(
  unsafeGroupId: string,
): Promise<GroupChangeTokenResult> {
  const context = await resolveGroupReadContext(unsafeGroupId);
  if (!context) return classifyDenied();

  const aggregates = await Promise.all(
    CHANGE_SOURCES.map((table) => readAggregate(context, table)),
  );
  return { kind: "ready", token: buildChangeToken(aggregates) };
}
