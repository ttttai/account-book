import "server-only";

import type { LineLinkGateway } from "../application/handle-line-webhook";
import type { WeeklyReportGateway } from "../application/send-weekly-report";
import { pushLineTextMessage } from "./line-client";
import type { NotifierConfig } from "./notifier-config";
import { createNotifierDbGateway } from "./notifier-db";

export type NotifierGateway = WeeklyReportGateway & LineLinkGateway;

// 設定からDBとLINEの実境界を束ねる。Route Handlerはこれをapplication層へ渡す
export function createNotifierGateway(config: NotifierConfig): NotifierGateway {
  return {
    ...createNotifierDbGateway(config.databaseUrl),
    pushText: (lineGroupId, text) =>
      pushLineTextMessage(config.channelAccessToken, lineGroupId, text),
  };
}
