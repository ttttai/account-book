import "server-only";

import type { BugReportContext } from "../application/handle-line-messages";
import { getBugReportConfig } from "./bug-report-config";
import { createGitHubIssue } from "./github-client";
import type { NotifierConfig } from "./notifier-config";
import { createNotifierDbGateway } from "./notifier-db";

// 起票用の設定と境界（DB・GitHub）を束ねる。起票用環境変数が揃わなければnull（LBR-010）。
// 連携先の照合には週次レポートと同じget_line_report_targetを使う
export function createBugReportContext(
  notifier: NotifierConfig,
): BugReportContext | null {
  const config = getBugReportConfig();
  if (!config) return null;

  const db = createNotifierDbGateway(notifier.databaseUrl);
  return {
    settings: {
      groupId: notifier.groupId,
      allowedUserIds: new Set(config.allowedUserIds),
    },
    gateway: {
      fetchLinkedLineGroupId: async (groupId) =>
        (await db.fetchTarget(groupId))?.lineGroupId ?? null,
      claimReport: db.claimReport,
      completeReport: db.completeReport,
      releaseReport: db.releaseReport,
      createIssue: (issue) =>
        createGitHubIssue(config.githubToken, config.githubRepository, issue),
    },
  };
}
