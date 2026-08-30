import "server-only";

import { buildWeeklySummaryMessage } from "../domain/line-message";
import { calculateWeeklyRange } from "../domain/week-range";
import {
  claimWeeklyNotification,
  fetchWeeklySummary,
  releaseWeeklyNotification,
} from "../infrastructure/notifier-db";
import { pushLineTextMessage } from "../infrastructure/line-client";
import type { NotifierConfig } from "../infrastructure/notifier-config";

export type WeeklySummaryResult = "sent" | "already_sent" | "no_line_target";

// 週次の支出集計をLINEグループへ送信する (NOTIF-001)。
// 送信枠を先に確保して二重送信を防ぎ、送信失敗時は枠を返上してリトライ可能にする
export async function sendWeeklySummary(
  config: NotifierConfig,
  now: Date = new Date(),
): Promise<WeeklySummaryResult> {
  const range = calculateWeeklyRange(now, "Asia/Tokyo");
  const { lineGroupId, summary } = await fetchWeeklySummary(
    config.databaseUrl,
    config.groupId,
    range,
  );
  if (!lineGroupId) return "no_line_target";

  const claimed = await claimWeeklyNotification(
    config.databaseUrl,
    config.groupId,
    range.weekStart,
  );
  if (!claimed) return "already_sent";

  try {
    const message = buildWeeklySummaryMessage(summary, range);
    await pushLineTextMessage(config.channelAccessToken, lineGroupId, message);
  } catch (error) {
    await releaseWeeklyNotification(
      config.databaseUrl,
      config.groupId,
      range.weekStart,
    );
    throw error;
  }
  return "sent";
}
