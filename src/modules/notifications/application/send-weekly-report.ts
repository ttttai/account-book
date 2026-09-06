import "server-only";

import { calculateWeeklyReportPeriod } from "../domain/report-period";
import type { WeeklyReportSource } from "../domain/report-source";
import {
  buildWeeklyReport,
  formatWeeklyReportMessage,
} from "../domain/weekly-report";

/** 連携先とグループの表示に必要な最小情報 */
export type WeeklyReportTarget = Readonly<{
  lineGroupId: string | null;
  groupName: string;
  timezone: string;
}>;

/** 送信フローが依存する外部境界。DBとLINEの実装は差し替え可能にし、単体テストで検証する */
export type WeeklyReportGateway = Readonly<{
  fetchTarget: (groupId: string) => Promise<WeeklyReportTarget | null>;
  fetchSource: (
    groupId: string,
    months: readonly string[],
    budgetMonth: string,
  ) => Promise<WeeklyReportSource>;
  claimWeek: (groupId: string, weekStart: string) => Promise<boolean>;
  releaseWeek: (groupId: string, weekStart: string) => Promise<void>;
  pushText: (lineGroupId: string, text: string) => Promise<void>;
}>;

export type WeeklyReportResult = "sent" | "already_sent" | "no_line_target";

// 週次レポートをLINEグループへ送信する (NOTIF-001)。
// 未連携なら集計元を読まずに終了し、送信枠を先に確保して二重送信を防ぎ、送信失敗時は枠を返上してリトライ可能にする (NOTIF-008)
export async function sendWeeklyReport(
  groupId: string,
  gateway: WeeklyReportGateway,
  now: Date = new Date(),
): Promise<WeeklyReportResult> {
  const target = await gateway.fetchTarget(groupId);
  if (!target?.lineGroupId) return "no_line_target";

  const period = calculateWeeklyReportPeriod(now, target.timezone);
  const source = await gateway.fetchSource(
    groupId,
    period.months,
    period.month,
  );
  const message = formatWeeklyReportMessage(
    buildWeeklyReport(target.groupName, period, source),
  );

  const claimed = await gateway.claimWeek(groupId, period.week.start);
  if (!claimed) return "already_sent";

  try {
    await gateway.pushText(target.lineGroupId, message);
  } catch (error) {
    await gateway.releaseWeek(groupId, period.week.start);
    throw error;
  }
  return "sent";
}
