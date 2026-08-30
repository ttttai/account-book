import "server-only";

import postgres from "postgres";
import { z } from "zod";

import type { WeeklyExpenseSummary } from "../domain/line-message";
import type { WeeklyRange } from "../domain/week-range";

const summarySchema = z.object({
  line_group_id: z.string().nullable(),
  total_minor: z.number().int().nonnegative(),
  transaction_count: z.number().int().nonnegative(),
  previous_total_minor: z.number().int().nonnegative(),
  categories: z.array(
    z.object({
      name: z.string(),
      amount_minor: z.number().int().nonnegative(),
      transaction_count: z.number().int().nonnegative(),
    }),
  ),
});

export type WeeklySummaryWithTarget = Readonly<{
  lineGroupId: string | null;
  summary: WeeklyExpenseSummary;
}>;

// 通知専用ロールで接続し、処理ごとに接続を閉じる(Cloud Run min 0のため常駐poolを持たない)
async function withNotifierDb<T>(
  databaseUrl: string,
  run: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

// 週次集計と連携先LINEグループを取得する
export async function fetchWeeklySummary(
  databaseUrl: string,
  groupId: string,
  range: WeeklyRange,
): Promise<WeeklySummaryWithTarget> {
  return withNotifierDb(databaseUrl, async (sql) => {
    const rows = await sql`
      select app_private.get_weekly_line_summary(
        ${groupId}::uuid, ${range.weekStart}::date, ${range.weekEnd}::date
      ) as summary
    `;
    const parsed = summarySchema.parse(rows[0]?.summary);
    return {
      lineGroupId: parsed.line_group_id,
      summary: {
        totalMinor: parsed.total_minor,
        transactionCount: parsed.transaction_count,
        previousTotalMinor: parsed.previous_total_minor,
        categories: parsed.categories.map((category) => ({
          name: category.name,
          amountMinor: category.amount_minor,
          transactionCount: category.transaction_count,
        })),
      },
    };
  });
}

// 対象週の送信枠を確保する。falseなら送信済み(二重送信防止)
export async function claimWeeklyNotification(
  databaseUrl: string,
  groupId: string,
  weekStart: string,
): Promise<boolean> {
  return withNotifierDb(databaseUrl, async (sql) => {
    const rows = await sql`
      select app_private.claim_weekly_notification(
        ${groupId}::uuid, ${weekStart}::date
      ) as claimed
    `;
    return rows[0]?.claimed === true;
  });
}

// 送信失敗時に確保済みの送信枠を返上する
export async function releaseWeeklyNotification(
  databaseUrl: string,
  groupId: string,
  weekStart: string,
): Promise<void> {
  await withNotifierDb(databaseUrl, async (sql) => {
    await sql`
      select app_private.release_weekly_notification(
        ${groupId}::uuid, ${weekStart}::date
      )
    `;
  });
}

// LINEグループ連携を登録する(join event)
export async function linkLineGroup(
  databaseUrl: string,
  groupId: string,
  lineGroupId: string,
): Promise<void> {
  await withNotifierDb(databaseUrl, async (sql) => {
    await sql`
      select app_private.link_line_group(${groupId}::uuid, ${lineGroupId})
    `;
  });
}

// LINEグループ連携を解除する(leave event)
export async function unlinkLineGroup(
  databaseUrl: string,
  lineGroupId: string,
): Promise<void> {
  await withNotifierDb(databaseUrl, async (sql) => {
    await sql`select app_private.unlink_line_group(${lineGroupId})`;
  });
}
