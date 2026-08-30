import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// NOTIF-007: 通知専用ロールが最小権限で宣言されている
test("migrationが通知専用ロールへ関数EXECUTEだけを許可する", async () => {
  const migration = await read(
    "supabase/migrations/202608300001_line_weekly_notification.sql",
  );

  assert.match(migration, /create role line_notifier nologin/);
  // 通知用関数はすべてsecurity definerでsearch_pathを固定する
  const definers = migration.match(/security definer/g);
  assert.equal(definers?.length, 5);
  const searchPaths = migration.match(/set search_path = ''/g);
  assert.equal(searchPaths?.length, 5);
  // 関数はpublicから剥奪しline_notifierだけへ付与する
  assert.equal(migration.match(/revoke all on function/g)?.length, 5);
  assert.equal(migration.match(/to line_notifier/g)?.length, 6);
  // tableへの直接権限をline_notifierへ与えない
  assert.doesNotMatch(migration, /grant .* on table .* to line_notifier/);
  // service role keyを前提にしない
  assert.doesNotMatch(migration, /service_role/);
});

// NOTIF-005, NOTIF-006, NOTIF-010: 各endpointが検証境界とfail closedを持つ
test("Webhookとジョブのendpointが検証とfail closedを実装する", async () => {
  const webhook = await read("src/app/api/v1/line/webhook/route.ts");
  assert.match(webhook, /getNotifierConfig/);
  assert.match(webhook, /status: 404/);
  assert.match(webhook, /verifyLineSignature/);
  assert.match(webhook, /status: 403/);

  const job = await read("src/app/api/v1/jobs/weekly-line-summary/route.ts");
  assert.match(job, /getNotifierConfig/);
  assert.match(job, /status: 404/);
  assert.match(job, /verifySchedulerIdentity/);
  assert.match(job, /status: 403/);
});

// NOTIF-009: サーバー専用moduleとして宣言され、秘密値をログへ出さない
test("通知moduleがサーバー専用で公開エントリーポイントを持つ", async () => {
  for (const path of [
    "src/modules/notifications/server.ts",
    "src/modules/notifications/application/send-weekly-summary.ts",
    "src/modules/notifications/application/handle-line-webhook.ts",
    "src/modules/notifications/infrastructure/notifier-config.ts",
    "src/modules/notifications/infrastructure/notifier-db.ts",
    "src/modules/notifications/infrastructure/line-client.ts",
    "src/modules/notifications/infrastructure/job-auth.ts",
  ]) {
    const source = await read(path);
    assert.match(source, /import "server-only";/, path);
    assert.doesNotMatch(source, /console\./, path);
  }
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
    "src/modules/notifications/application/send-weekly-summary.ts",
  );
  const claimIndex = send.indexOf("claimWeeklyNotification(");
  const pushIndex = send.indexOf("pushLineTextMessage(");
  assert.ok(claimIndex > 0 && pushIndex > claimIndex);
  assert.match(send, /releaseWeeklyNotification/);
});

// 統合テストが登録されている
test("統合テストがrun-localへ登録されている", async () => {
  const runner = await read("tests/integration/run-local.sql");
  assert.match(runner, /\\ir line-notification-local\.sql/);
});

// 仕様が一覧へ登録されている
test("週次LINE通知の仕様が仕様一覧へ登録されている", async () => {
  const index = await read("specs/README.md");
  assert.match(index, /12-line-weekly-notification\.md/);
  assert.match(index, /`NOTIF`/);
});
