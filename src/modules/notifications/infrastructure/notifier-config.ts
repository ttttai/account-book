import "server-only";

import { z } from "zod";

export type NotifierConfig = Readonly<{
  channelSecret: string;
  channelAccessToken: string;
  databaseUrl: string;
  groupId: string;
  jobAudience: string;
  jobInvoker: string;
}>;

const configSchema = z.object({
  channelSecret: z.string().min(1),
  channelAccessToken: z.string().min(1),
  databaseUrl: z.string().min(1),
  groupId: z.uuid(),
  jobAudience: z.url(),
  jobInvoker: z.string().email(),
});

// 通知機能の設定を環境変数から読む。1つでも欠けていればnull(機能無効, NOTIF-010)
export function getNotifierConfig(): NotifierConfig | null {
  const result = configSchema.safeParse({
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    databaseUrl: process.env.NOTIFIER_DATABASE_URL,
    groupId: process.env.WEEKLY_SUMMARY_GROUP_ID,
    jobAudience: process.env.WEEKLY_SUMMARY_JOB_AUDIENCE,
    jobInvoker: process.env.WEEKLY_SUMMARY_JOB_INVOKER,
  });
  return result.success ? result.data : null;
}
