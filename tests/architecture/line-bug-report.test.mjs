import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function read(path) {
  return readFile(new URL(path, root), "utf8");
}

const migrationPath = "supabase/migrations/202609070001_line_bug_report.sql";
const bugReportDomainFile = "src/modules/notifications/domain/bug-report.ts";
const bugReportServerFiles = [
  "src/modules/notifications/application/handle-line-messages.ts",
  "src/modules/notifications/infrastructure/bug-report-config.ts",
  "src/modules/notifications/infrastructure/bug-report-gateway.ts",
  "src/modules/notifications/infrastructure/github-client.ts",
];

// 仕様・レビュー・要件IDが登録されている
test("LINE不具合報告の仕様を正本として承認記録に紐付ける (LBR-001〜LBR-011)", async () => {
  const specification = await read("specs/17-line-bug-report.md");
  const requirements = await read("specs/01-product-requirements.md");
  const useCases = await read("specs/02-use-cases.md");
  const review = await read("specs/reviews/2026-09-07-line-bug-report.md");
  const index = await read("specs/README.md");
  const weeklyReport = await read("specs/16-line-weekly-report.md");

  assert.match(specification, /状態: 承認済み/);
  assert.match(specification, /app_private\.claim_line_issue_report/);
  // 応答後処理を使わない判断を仕様に残す (LBR-009)
  assert.match(specification, /`after\(\)`（応答後処理）は使わない/);
  assert.match(requirements, /^- `LBR-001`/m);
  assert.match(requirements, /^- `LBR-011`/m);
  assert.match(useCases, /^## UC-022 /m);
  assert.match(useCases, /^- `AC-LBR-001-1`/m);
  assert.match(useCases, /^- `AC-LBR-011-1`/m);
  assert.match(review, /状態: (承認済み|実装確認済み)/);
  assert.match(review, /関連ID: 追加: LBR-001〜LBR-011/);
  assert.match(index, /17-line-bug-report\.md/);
  assert.match(index, /`LBR`/);
  // 週次レポート仕様のmessage event除外と矛盾しない
  assert.match(weeklyReport, /message eventは\[`17-line-bug-report\.md`\]/);
});

// LBR-007: 起票記録は通知専用ロールの関数だけで更新し、完了済みは返上しない
test("migrationが起票記録tableと通知専用ロール向け関数3つを最小権限で宣言する", async () => {
  const migration = await read(migrationPath);

  assert.match(migration, /create table app_private\.line_issue_reports/);
  assert.match(migration, /line_message_id text primary key/);
  assert.match(migration, /\^\[0-9A-Za-z_-\]\{1,64\}\$/);
  // 本文・報告者・Issue URLを保存する列を持たない
  for (const forbidden of [
    "text_body",
    "user_id",
    "html_url",
    "display_name",
  ]) {
    assert.doesNotMatch(migration, new RegExp(forbidden), forbidden);
  }
  assert.equal(migration.match(/security definer/g)?.length, 3);
  assert.equal(migration.match(/set search_path = ''/g)?.length, 3);
  assert.equal(migration.match(/revoke all on function/g)?.length, 3);
  assert.equal(migration.match(/grant execute on function/g)?.length, 3);
  assert.equal(migration.match(/to line_notifier/g)?.length, 3);
  assert.doesNotMatch(migration, /grant .* on table .* to line_notifier/);
  assert.doesNotMatch(migration, /service_role/);
  // 返上は未完了行だけを削除する
  const releaseFunction = migration.slice(
    migration.indexOf("app_private.release_line_issue_report("),
    migration.indexOf("revoke all on function"),
  );
  assert.match(releaseFunction, /issue_number is null/);
});

// LBR-009, LBR-010: Route Handlerは同期処理で、起票設定が無くてもWebhook自体の404条件を変えない
test("Webhook Route Handlerがmessage eventを同期処理し、after()を使わない", async () => {
  const webhook = await read("src/app/api/v1/line/webhook/route.ts");

  assert.match(webhook, /getNotifierConfig/);
  assert.match(webhook, /status: 404/);
  assert.match(webhook, /verifyLineSignature/);
  assert.match(webhook, /status: 403/);
  assert.match(webhook, /handleLineWebhook\(/);
  assert.match(webhook, /handleLineMessages\(/);
  assert.match(webhook, /createBugReportContext\(/);
  assert.doesNotMatch(webhook, /after\(/);
  assert.doesNotMatch(webhook, /from "next\/server"/);
  // 監査ログは件数だけで、userId・本文・groupIdを出さない (LBR-003)
  const logStatements = webhook.match(/console\.\w+\([^;]*\);/gs) ?? [];
  assert.ok(logStatements.length >= 1, "許可外件数のログが必要です");
  for (const statement of logStatements) {
    assert.doesNotMatch(statement, /userId|rawBody|groupId|text/);
    assert.match(statement, /unauthorized/);
  }
});

// LBR-006, LBR-009: サーバー専用で、秘密値をログへ出さず、外部呼び出しに上限時間を設ける
test("不具合報告のmoduleがサーバー専用で公開エントリーポイントを持つ", async () => {
  for (const path of bugReportServerFiles) {
    const source = await read(path);
    assert.match(source, /import "server-only";/, path);
    assert.doesNotMatch(source, /console\./, path);
  }
  const domain = await read(bugReportDomainFile);
  assert.doesNotMatch(domain, /console\.|process\.env|fetch\(/);

  const server = await read("src/modules/notifications/server.ts");
  assert.match(server, /handleLineMessages/);
  assert.match(server, /createBugReportContext/);
  assert.doesNotMatch(server, /getBugReportConfig/);
});

test("GitHub clientがUser-Agent・APIバージョン・上限時間付きでIssues APIだけを呼ぶ", async () => {
  const client = await read(
    "src/modules/notifications/infrastructure/github-client.ts",
  );

  assert.match(client, /https:\/\/api\.github\.com\/repos\//);
  assert.match(client, /"User-Agent"/);
  assert.match(client, /"X-GitHub-Api-Version"/);
  assert.match(client, /AbortSignal\.timeout\(/);
  assert.match(client, /Authorization: `Bearer \$\{/);
  // 失敗時のエラーはstatusだけを含み、応答本文やtokenを含めない
  assert.match(client, /GITHUB_ISSUE_FAILED_\$\{response\.status\}/);
  assert.doesNotMatch(client, /await response\.text\(\)/);
});

// LBR-008: 返信はReply APIだけを使い、Push APIを使わない
test("起票フローと返信がReply APIだけを使う", async () => {
  const lineClient = await read(
    "src/modules/notifications/infrastructure/line-client.ts",
  );
  assert.match(lineClient, /https:\/\/api\.line\.me\/v2\/bot\/message\/reply/);
  assert.match(lineClient, /replyToken/);

  for (const path of [
    "src/modules/notifications/application/handle-line-messages.ts",
    "src/modules/notifications/infrastructure/bug-report-gateway.ts",
  ]) {
    const source = await read(path);
    assert.doesNotMatch(
      source,
      /pushText|message\/push|pushLineTextMessage/,
      path,
    );
  }
});

// LBR-010: 環境変数の欠落で無効になり、許可リストは許可Googleアカウントと同じ厳格さで検証する
test("起票設定が3つの環境変数を検証し、欠落時はnullになる", async () => {
  const config = await read(
    "src/modules/notifications/infrastructure/bug-report-config.ts",
  );
  for (const name of [
    "LINE_BUG_REPORT_GITHUB_TOKEN",
    "LINE_BUG_REPORT_GITHUB_REPOSITORY",
    "LINE_BUG_REPORT_ALLOWED_USER_IDS",
  ]) {
    assert.match(config, new RegExp(name));
  }
  assert.match(config, /\^U\[0-9a-f\]\{32\}\$/);
  assert.match(config, /return null/);
});

// 統合テストが登録されている
test("統合テストがrun-localへ登録されている", async () => {
  const runner = await read("tests/integration/run-local.sql");
  assert.match(runner, /\\ir line-bug-report-local\.sql/);
});

// 運用資料が存在し、秘密値を含まない
test("導入ガイドが段階分割・トークン発行・userId取得・公開リポジトリの注意を説明する", async () => {
  const guide = await read("docs/operations/line-bug-report.md");
  const readme = await read("README.md");

  for (const phrase of [
    "202609070001_line_bug_report",
    "Fine-grained personal access token",
    "Issues",
    "LINE_BUG_REPORT_GITHUB_TOKEN",
    "LINE_BUG_REPORT_ALLOWED_USER_IDS",
    "LINE_BUG_REPORT_GITHUB_REPOSITORY",
    "source:line",
    "公開リポジトリ",
    "Webhookの再送",
  ]) {
    assert.match(guide, new RegExp(phrase), phrase);
  }
  // 1対1トークでのuserId取得手順 (LBR-011)
  assert.match(guide, /1対1トーク/);
  // トークンや実際のuserIdの値を書かない
  assert.doesNotMatch(guide, /github_pat_[A-Za-z0-9_]{10,}/);
  assert.doesNotMatch(guide, /U[0-9a-f]{32}/);
  assert.match(readme, /line-bug-report\.md/);
});
