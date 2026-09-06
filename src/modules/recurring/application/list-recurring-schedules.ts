import "server-only";

import { z } from "zod";

import type { createServerSupabaseClient } from "@/modules/auth/server";

import type { RecurringSchedule } from "../domain/recurring-schedule";
import {
  RECURRING_SELECT_COLUMNS,
  recurringRowSchema,
  toRecurringSchedule,
} from "./recurring-row";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

// カレンダー等の集計から使う、グループの固定費設定一覧
// RLSでアクティブメンバーだけがselectできる。展開は呼び出し側の純関数で行う
export async function listRecurringSchedules(
  supabase: ServerSupabaseClient,
  groupId: string,
): Promise<readonly RecurringSchedule[]> {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select(RECURRING_SELECT_COLUMNS)
    .eq("group_id", groupId)
    .order("day_of_month", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error("固定費を取得できませんでした。");

  return z
    .array(recurringRowSchema)
    .parse(data ?? [])
    .map(toRecurringSchedule);
}
