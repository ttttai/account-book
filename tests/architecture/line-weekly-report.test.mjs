import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function read(path) {
  return readFile(new URL(path, root), "utf8");
}

const migrationPath = "supabase/migrations/202609060001_line_weekly_report.sql";
const membersMigrationPath =
  "supabase/migrations/202609070002_line_weekly_report_members.sql";
const notificationFiles = [
  "src/modules/notifications/server.ts",
  "src/modules/notifications/application/send-weekly-report.ts",
  "src/modules/notifications/application/handle-line-webhook.ts",
  "src/modules/notifications/infrastructure/notifier-config.ts",
  "src/modules/notifications/infrastructure/notifier-db.ts",
  "src/modules/notifications/infrastructure/notifier-gateway.ts",
  "src/modules/notifications/infrastructure/line-client.ts",
  "src/modules/notifications/infrastructure/job-auth.ts",
];

// 仕様・レビュー・要件IDが登録されている
test("LINE週次レポートの仕様を正本として承認記録に紐付ける (NOTIF-001〜NOTIF-010)", async () => {
  const specification = await read("specs/16-line-weekly-report.md");
  const requirements = await read("specs/01-product-requirements.md");
  const useCases = await read("specs/02-use-cases.md");
  const review = await read("specs/reviews/2026-09-06-line-weekly-report.md");
  const index = await read("specs/README.md");

  assert.match(specification, /状態: 承認済み/);
  assert.match(specification, /app_private\.get_line_report_source/);
  assert.match(specification, /calculateBudgetProgress|予算進捗純関数/);
  assert.match(requirements, /^- `NOTIF-001`/m);
  assert.match(requirements, /^- `NOTIF-010`/m);
  assert.match(useCases, /^- `AC-NOTIF-001-1`/m);
  assert.match(useCases, /^- `AC-NOTIF-010-1`/m);
  assert.match(review, /状態: (承認済み|実装確認済み)/);
  assert.match(review, /関連ID: 追加: NOTIF-001〜NOTIF-010/);
  assert.match(index, /16-line-weekly-report\.md/);
  assert.match(index, /`NOTIF`/);
});

// NOTIF-007: 通知専用ロールが最小権限で宣言されている
test("migrationが通知専用ロールへ関数EXECUTEだけを許可する", async () => {
  const migration = await read(migrationPath);

  assert.match(migration, /create role line_notifier nologin/);
  // 通知用関数はすべてsecurity definerでsearch_pathを固定する
  assert.equal(migration.match(/security definer/g)?.length, 6);
  assert.equal(migration.match(/set search_path = ''/g)?.length, 6);
  // 関数はpublicから剥奪しline_notifierだけへ付与する
  assert.equal(migration.match(/revoke all on function/g)?.length, 6);
  assert.equal(migration.match(/to line_notifier/g)?.length, 7);
  // tableへの直接権限をline_notifierへ与えない
  assert.doesNotMatch(migration, /grant .* on table .* to line_notifier/);
  // service role keyを前提にしない
  assert.doesNotMatch(migration, /service_role/);
  // 集計元は個人名・メモ・支払者・負担額を返さない (AC-NOTIF-002-2)
  const sourceFunction = migration.slice(
    migration.indexOf("app_private.get_line_report_source("),
    migration.indexOf("app_private.claim_weekly_notification("),
  );
  for (const forbidden of [
    "memo",
    "payer_member_id",
    "recipient_member_id",
    "display_name",
    "transaction_allocations",
    "profiles",
  ]) {
    assert.doesNotMatch(sourceFunction, new RegExp(forbidden), forbidden);
  }
  // 画面と同じ未削除条件で読む (NOTIF-003)
  assert.match(sourceFunction, /deleted_at is null/);
});

// NOTIF-007, D-013: 集計元の置き換えは同じ権限を保ち、メンバー表示名・負担額を返してメモ・名称を返さない
test("文面拡充のmigrationが集計元関数を同じ権限で置き換え、メンバーと負担額を返す", async () => {
  const migration = await read(membersMigrationPath);
  const review = await read(
    "specs/reviews/2026-09-07-line-weekly-report-members.md",
  );
  const decisions = await read("specs/08-decisions-and-deferred-scope.md");

  assert.match(
    migration,
    /create or replace function app_private\.get_line_report_source\(/,
  );
  assert.equal(migration.match(/security definer/g)?.length, 1);
  assert.equal(migration.match(/set search_path = ''/g)?.length, 1);
  assert.match(
    migration,
    /revoke all on function app_private\.get_line_report_source/,
  );
  assert.match(
    migration,
    /grant execute on function app_private\.get_line_report_source[^;]*to line_notifier/,
  );
  assert.doesNotMatch(migration, /grant .* on table/);
  for (const column of [
    "'payer_member_id'",
    "'allocations'",
    "'members'",
    "'display_name'",
  ]) {
    assert.match(migration, new RegExp(column), column);
  }
  assert.match(migration, /m\.status = 'active'/);
  for (const forbidden of ["memo", "t.name", "r.name", "service_role"]) {
    assert.doesNotMatch(
      migration,
      new RegExp(forbidden.replace(".", "\\.")),
      forbidden,
    );
  }
  assert.match(review, /状態: (承認済み|実装確認済み)/);
  assert.match(decisions, /^### D-013 /m);
});

// NOTIF-005, NOTIF-006, NOTIF-010: 各endpointが検証境界とfail closedを持つ
test("Webhookとジョブのendpointが検証とfail closedを実装する", async () => {
  const webhook = await read("src/app/api/v1/line/webhook/route.ts");
  assert.match(webhook, /getNotifierConfig/);
  assert.match(webhook, /status: 404/);
  assert.match(webhook, /verifyLineSignature/);
  assert.match(webhook, /status: 403/);

  const job = await read("src/app/api/v1/jobs/weekly-line-report/route.ts");
  assert.match(job, /getNotifierConfig/);
  assert.match(job, /status: 404/);
  assert.match(job, /verifySchedulerIdentity/);
  assert.match(job, /status: 403/);
});

// NOTIF-009: サーバー専用moduleとして宣言され、秘密値をログへ出さない
test("通知moduleがサーバー専用で公開エントリーポイントを持つ", async () => {
  for (const path of notificationFiles) {
    const source = await read(path);
    assert.match(source, /import "server-only";/, path);
    assert.doesNotMatch(source, /console\./, path);
  }
});

// 他moduleの内部を直接importせず、公開エントリーポイントだけを使う
test("通知moduleは分析・固定費・予算を公開エントリーポイント経由で使う", async () => {
  const directories = [
    "src/modules/notifications/domain",
    "src/modules/notifications/application",
    "src/modules/notifications/infrastructure",
  ];
  for (const directory of directories) {
    for (const file of await readdir(new URL(`${directory}/`, root))) {
      const source = await read(`${directory}/${file}`);
      assert.doesNotMatch(
        source,
        /@\/modules\/(analytics|budgets|recurring|transactions|groups)\/(domain|application|infrastructure|presentation|server)/,
        `${directory}/${file}`,
      );
    }
  }

  const weeklyReport = await read(
    "src/modules/notifications/domain/weekly-report.ts",
  );
  // 金額は分析・予算の純関数で計算し、通知側で再実装しない (NOTIF-003)
  assert.match(weeklyReport, /aggregateAnalyticsDateRange/);
  assert.match(weeklyReport, /aggregateAnalyticsMonth/);
  assert.match(weeklyReport, /summarizeCategoryBreakdown/);
  assert.match(weeklyReport, /calculateBudgetProgress/);
  // メンバーの支出は分析のメンバー対象（負担額）で求め、構成比も分析の純関数を使う (D-013)
  assert.match(weeklyReport, /scope: "member"/);
  assert.match(weeklyReport, /sharePercentOf/);
  // 月末の見込みは整数演算で、浮動小数点の除算結果を金額にしない (AC-NOTIF-003-3)
  assert.match(weeklyReport, /scaled % input\.elapsedDays/);

  const analyticsIndex = await read("src/modules/analytics/index.ts");
  assert.match(analyticsIndex, /aggregateAnalyticsDateRange/);
});

// NOTIF-006: OIDC検証がissuer・audience・SA emailをすべて確認する
test("ジョブのOIDC検証がGoogle発行者とaudienceとSAを確認する", async () => {
  const auth = await read(
    "src/modules/notifications/infrastructure/job-auth.ts",
  );
  assert.match(auth, /https:\/\/accounts\.google\.com/);
  assert.match(auth, /audience/);
  assert.match(auth, /email_verified/);
});

// NOTIF-008: 送信枠の確保が送信より先に行われる
test("週次送信が送信枠の確保後にpushし、失敗時に枠を返上する", async () => {
  const send = await read(
    "src/modules/notifications/application/send-weekly-report.ts",
  );
  const fetchTargetIndex = send.indexOf("gateway.fetchTarget(");
  const claimIndex = send.indexOf("gateway.claimWeek(");
  const pushIndex = send.indexOf("gateway.pushText(");
  assert.ok(fetchTargetIndex > 0 && claimIndex > fetchTargetIndex);
  assert.ok(pushIndex > claimIndex);
  assert.match(send, /gateway\.releaseWeek\(/);
});

// 統合テストが登録されている
test("統合テストがrun-localへ登録されている", async () => {
  const runner = await read("tests/integration/run-local.sql");
  assert.match(runner, /\\ir line-weekly-report-local\.sql/);
});

// 運用資料が存在し、秘密値を含まない
test("導入ガイドが段階分割と手動設定を説明し、秘密値を含まない", async () => {
  const guide = await read("docs/operations/line-weekly-report.md");
  assert.match(guide, /LINE_WEEKLY_REPORT_GROUP_ID/);
  assert.match(guide, /gcloud secrets versions add/);
  assert.match(guide, /Webhook/);
  assert.doesNotMatch(guide, /postgresql:\/\/line_notifier:[^<]/);
});
