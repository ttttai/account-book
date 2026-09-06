import "server-only";

import postgres from "postgres";
import { z } from "zod";

import type { LineBugReportGateway } from "../application/handle-line-messages";
import type { LineLinkGateway } from "../application/handle-line-webhook";
import type {
  WeeklyReportGateway,
  WeeklyReportTarget,
} from "../application/send-weekly-report";
import type { WeeklyReportSource } from "../domain/report-source";

const safeAmountSchema = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// DBは月初日のdateで返すため、`YYYY-MM`へ切り詰める
const monthSchema = isoDateSchema.transform((value) => value.slice(0, 7));

const targetSchema = z.object({
  line_group_id: z.string().nullable(),
  group_name: z.string(),
  timezone: z.string(),
});

const sourceSchema = z.object({
  expenses: z.array(
    z.object({
      date: isoDateSchema,
      amount_minor: safeAmountSchema,
      category_id: z.uuid(),
      category_name: z.string(),
      category_color: z.string(),
    }),
  ),
  incomes: z.array(
    z.object({ date: isoDateSchema, amount_minor: safeAmountSchema }),
  ),
  recurring: z.array(
    z.object({
      id: z.uuid(),
      type: z.enum(["expense", "income"]),
      amount_minor: safeAmountSchema,
      day_of_month: z.number().int().min(1).max(28),
      start_month: monthSchema,
      end_month: monthSchema.nullable(),
      category_id: z.uuid(),
      category_name: z.string(),
      category_color: z.string(),
    }),
  ),
  budget: z
    .object({
      effective_month: monthSchema,
      status: z.enum(["active", "disabled"]),
      total_amount_minor: safeAmountSchema.nullable(),
      version: z.number().int().min(1),
      category_limits: z.array(
        z.object({
          category_id: z.uuid(),
          category_name: z.string(),
          category_color: z.string(),
          amount_minor: safeAmountSchema,
        }),
      ),
    })
    .nullable(),
});

// 通知専用ロールで接続し、処理ごとに接続を閉じる（Cloud Run min 0のため常駐poolを持たない）
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

function monthToFirstDay(month: string): string {
  return `${month}-01`;
}

// 連携先とグループ名・タイムゾーンを取得する。グループが存在しなければnull
async function fetchTarget(
  databaseUrl: string,
  groupId: string,
): Promise<WeeklyReportTarget | null> {
  return withNotifierDb(databaseUrl, async (sql) => {
    const rows = await sql`
      select app_private.get_line_report_target(${groupId}::uuid) as target
    `;
    const raw = rows[0]?.target;
    if (raw === null || raw === undefined) return null;
    const parsed = targetSchema.parse(raw);
    return {
      lineGroupId: parsed.line_group_id,
      groupName: parsed.group_name,
      timezone: parsed.timezone,
    };
  });
}

// 集計元（支出・収入の最小列、固定費の展開条件、対象月の適用予算改定）を取得する (NOTIF-007)
async function fetchSource(
  databaseUrl: string,
  groupId: string,
  months: readonly string[],
  budgetMonth: string,
): Promise<WeeklyReportSource> {
  const sorted = [...months].sort();
  const startMonth = sorted[0];
  const endMonth = sorted[sorted.length - 1];
  if (!startMonth || !endMonth) throw new Error("REPORT_MONTHS_REQUIRED");

  return withNotifierDb(databaseUrl, async (sql) => {
    const rows = await sql`
      select app_private.get_line_report_source(
        ${groupId}::uuid,
        ${monthToFirstDay(startMonth)}::date,
        ${monthToFirstDay(endMonth)}::date,
        ${monthToFirstDay(budgetMonth)}::date
      ) as source
    `;
    const parsed = sourceSchema.parse(rows[0]?.source);
    return {
      expenses: parsed.expenses.map((row) => ({
        date: row.date,
        amountMinor: row.amount_minor,
        categoryId: row.category_id,
        categoryName: row.category_name,
        categoryColor: row.category_color,
      })),
      incomes: parsed.incomes.map((row) => ({
        date: row.date,
        amountMinor: row.amount_minor,
      })),
      recurring: parsed.recurring.map((row) => ({
        id: row.id,
        type: row.type,
        amountMinor: row.amount_minor,
        dayOfMonth: row.day_of_month,
        startMonth: row.start_month,
        endMonth: row.end_month,
        categoryId: row.category_id,
        categoryName: row.category_name,
        categoryColor: row.category_color,
      })),
      budget: parsed.budget
        ? {
            effectiveMonth: parsed.budget.effective_month,
            status: parsed.budget.status,
            totalAmountMinor: parsed.budget.total_amount_minor,
            version: parsed.budget.version,
            categoryLimits: parsed.budget.category_limits.map((limit) => ({
              categoryId: limit.category_id,
              categoryName: limit.category_name,
              categoryColor: limit.category_color,
              amountMinor: limit.amount_minor,
            })),
          }
        : null,
    };
  });
}

// 対象週の送信枠を確保する。falseなら送信済み（二重送信防止、NOTIF-008）
async function claimWeek(
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
async function releaseWeek(
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

// LINEグループ連携を登録する（join event）
async function link(
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

// LINEグループ連携を解除する（leave event）
async function unlink(databaseUrl: string, lineGroupId: string): Promise<void> {
  await withNotifierDb(databaseUrl, async (sql) => {
    await sql`select app_private.unlink_line_group(${lineGroupId})`;
  });
}

// message.idの起票記録を確保する。falseなら既に処理済み（二重起票防止、LBR-007）
async function claimReport(
  databaseUrl: string,
  groupId: string,
  messageId: string,
  receivedAt: Date,
): Promise<boolean> {
  return withNotifierDb(databaseUrl, async (sql) => {
    const rows = await sql`
      select app_private.claim_line_issue_report(
        ${groupId}::uuid, ${messageId}, ${receivedAt.toISOString()}::timestamptz
      ) as claimed
    `;
    return rows[0]?.claimed === true;
  });
}

// 起票成功後にIssue番号を記録する
async function completeReport(
  databaseUrl: string,
  messageId: string,
  issueNumber: number,
): Promise<void> {
  await withNotifierDb(databaseUrl, async (sql) => {
    await sql`
      select app_private.complete_line_issue_report(${messageId}, ${issueNumber}::integer)
    `;
  });
}

// 起票失敗時に未完了の記録を返上する
async function releaseReport(
  databaseUrl: string,
  messageId: string,
): Promise<void> {
  await withNotifierDb(databaseUrl, async (sql) => {
    await sql`select app_private.release_line_issue_report(${messageId})`;
  });
}

export type NotifierDbGateway = Omit<WeeklyReportGateway, "pushText"> &
  LineLinkGateway &
  Pick<
    LineBugReportGateway,
    "claimReport" | "completeReport" | "releaseReport"
  >;

// 通知専用ロールで接続するDB境界をまとめて作る。LINEへのpushは別の境界が担う
export function createNotifierDbGateway(
  databaseUrl: string,
): NotifierDbGateway {
  return {
    fetchTarget: (groupId) => fetchTarget(databaseUrl, groupId),
    fetchSource: (groupId, months, budgetMonth) =>
      fetchSource(databaseUrl, groupId, months, budgetMonth),
    claimWeek: (groupId, weekStart) =>
      claimWeek(databaseUrl, groupId, weekStart),
    releaseWeek: (groupId, weekStart) =>
      releaseWeek(databaseUrl, groupId, weekStart),
    link: (groupId, lineGroupId) => link(databaseUrl, groupId, lineGroupId),
    unlink: (lineGroupId) => unlink(databaseUrl, lineGroupId),
    claimReport: (groupId, messageId, receivedAt) =>
      claimReport(databaseUrl, groupId, messageId, receivedAt),
    completeReport: (messageId, issueNumber) =>
      completeReport(databaseUrl, messageId, issueNumber),
    releaseReport: (messageId) => releaseReport(databaseUrl, messageId),
  };
}
