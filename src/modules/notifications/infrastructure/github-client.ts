import "server-only";

import { z } from "zod";

import type { BugReportIssue } from "../domain/bug-report";
import type { CreatedIssue } from "../application/handle-line-messages";

const GITHUB_TIMEOUT_MS = 10_000;

const createdIssueSchema = z.object({
  number: z.number().int().positive(),
  html_url: z.url(),
});

// GitHub Issues APIでIssueを1件作成する (LBR-006)。
// tokenはAuthorizationヘッダーだけに載せ、失敗時はstatusだけを含む一般化したエラーを投げる
export async function createGitHubIssue(
  token: string,
  repository: string,
  issue: BugReportIssue,
): Promise<CreatedIssue> {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // GitHub APIはUser-Agentを必須とする
        "User-Agent": "account-book-line-bug-report",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
      }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`GITHUB_ISSUE_FAILED_${response.status}`);
  }
  const created = createdIssueSchema.parse(await response.json());
  return { number: created.number, url: created.html_url };
}
