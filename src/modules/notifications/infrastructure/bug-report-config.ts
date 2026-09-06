import "server-only";

import { z } from "zod";

export type BugReportConfig = Readonly<{
  githubToken: string;
  githubRepository: string;
  allowedUserIds: readonly string[];
}>;

const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/;
// GitHubの`owner/repo`。ownerは英数字と`-`、repoは英数字・`_`・`.`・`-`（先頭は`.`以外）
const GITHUB_REPOSITORY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;

// 許可リストは重複のない有効なuserId 1件以上でなければ全体を無効にする（許可Googleアカウントと同じ規則）
const allowedUserIdsSchema = z
  .string()
  .transform((value) => value.split(",").map((item) => item.trim()))
  .refine(
    (ids) =>
      ids.length > 0 &&
      ids.every((id) => LINE_USER_ID_PATTERN.test(id)) &&
      new Set(ids).size === ids.length,
  );

const configSchema = z.object({
  githubToken: z.string().min(1),
  githubRepository: z.string().regex(GITHUB_REPOSITORY_PATTERN),
  allowedUserIds: allowedUserIdsSchema,
});

// 環境変数の集合から起票設定を作る。1つでも欠落・不正ならnull（機能無効、LBR-010）
export function parseBugReportConfig(
  env: Readonly<Record<string, string | undefined>>,
): BugReportConfig | null {
  const result = configSchema.safeParse({
    githubToken: env.LINE_BUG_REPORT_GITHUB_TOKEN,
    githubRepository: env.LINE_BUG_REPORT_GITHUB_REPOSITORY,
    allowedUserIds: env.LINE_BUG_REPORT_ALLOWED_USER_IDS,
  });
  if (!result.success) return null;
  return result.data;
}

// 起票設定をプロセスの環境変数から読む
export function getBugReportConfig(): BugReportConfig | null {
  return parseBugReportConfig(process.env);
}
