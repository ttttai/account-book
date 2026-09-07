import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// INF-019, INF-020 (AC-INF-001-24): LINE週次レポート用のsecret containerとscheduler identityをbootstrapで宣言する
test("bootstrapがLINE週次レポート用secret containerとkeyなしscheduler SAを宣言する", async () => {
  const bootstrap = await read("infra/terraform/bootstrap/main.tf");
  const variables = await read("infra/terraform/bootstrap/variables.tf");
  const outputs = await read("infra/terraform/bootstrap/outputs.tf");

  assert.match(bootstrap, /cloudscheduler\.googleapis\.com/);
  assert.match(bootstrap, /resource\s+"google_service_account"\s+"scheduler"/);
  assert.match(
    bootstrap,
    /resource\s+"google_secret_manager_secret"\s+"line_weekly_report"\s*\{\s*for_each/s,
  );
  assert.match(
    bootstrap,
    /resource\s+"google_secret_manager_secret_iam_member"\s+"line_weekly_report_cloud_run_accessor"\s*\{\s*for_each\s*=\s*google_secret_manager_secret\.line_weekly_report/s,
  );
  // payloadはTerraform管理外（INF-019）
  assert.doesNotMatch(bootstrap, /google_secret_manager_secret_version/);
  assert.doesNotMatch(bootstrap, /secret_data\s*=/);
  // scheduler SAへはIAM roleを付けない（公開invokerのため不要、INF-020）
  assert.doesNotMatch(
    bootstrap,
    /member\s*=\s*"serviceAccount:\$\{google_service_account\.scheduler\.email\}"/,
  );
  assert.doesNotMatch(bootstrap, /google_service_account_key/);

  for (const secretId of [
    "account-book-line-channel-secret",
    "account-book-line-channel-access-token",
    "account-book-notifier-database-url",
  ]) {
    assert.match(variables, new RegExp(secretId));
  }
  assert.match(variables, /default\s*=\s*"account-book-scheduler"/);
  assert.match(outputs, /google_service_account\.scheduler\.email/);
});

// INF-021 (AC-INF-001-25): 既定nullで何も宣言せず、有効時だけ固定versionのsecret環境変数を渡す
test("prodのLINE週次レポート構成は既定で無効、有効時だけ環境変数6つを宣言する", async () => {
  const production = await read("infra/terraform/environments/prod/main.tf");
  const variables = await read(
    "infra/terraform/environments/prod/variables.tf",
  );

  assert.match(
    variables,
    /variable\s+"line_weekly_report"\s*\{[\s\S]*?default\s*=\s*null/,
  );
  assert.match(variables, /paused\s*=\s*optional\(bool,\s*false\)/);
  // group_idはUUID、versionは1以上の番号だけを受け付ける
  assert.match(variables, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/);
  assert.match(variables, /\^\[1-9\]\[0-9\]\*\$/);

  assert.match(
    production,
    /line_weekly_report_enabled\s*=\s*var\.line_weekly_report\s*!=\s*null/,
  );
  assert.match(
    production,
    /data\s+"google_secret_manager_secret"\s+"line_weekly_report"\s*\{\s*for_each/s,
  );
  assert.match(
    production,
    /data\s+"google_service_account"\s+"scheduler"\s*\{\s*count\s*=\s*local\.line_weekly_report_enabled/s,
  );
  for (const secretName of [
    "LINE_CHANNEL_SECRET",
    "LINE_CHANNEL_ACCESS_TOKEN",
    "NOTIFIER_DATABASE_URL",
  ]) {
    assert.match(production, new RegExp(`${secretName}\\s*=\\s*\\{`));
  }
  for (const plainName of [
    "LINE_WEEKLY_REPORT_GROUP_ID",
    "LINE_WEEKLY_REPORT_JOB_AUDIENCE",
    "LINE_WEEKLY_REPORT_JOB_INVOKER",
  ]) {
    assert.match(production, new RegExp(`${plainName}\\s*=`));
  }
  assert.match(
    production,
    /dynamic\s+"env"\s*\{\s*for_each\s*=\s*local\.line_weekly_report_secret_env/s,
  );
  assert.match(
    production,
    /dynamic\s+"env"\s*\{\s*for_each\s*=\s*local\.line_weekly_report_plain_env/s,
  );
  assert.match(production, /if\s+local\.line_weekly_report_enabled/);
  assert.match(production, /channel_secret_version/);
  assert.match(production, /channel_access_token_version/);
  assert.match(production, /notifier_database_url_version/);
  assert.doesNotMatch(production, /version\s*=\s*"latest"/);
});

// INF-020 (AC-INF-001-26): Cloud Scheduler jobはOIDCで呼び、audienceとURLを同じ値から導出する
test("Cloud Scheduler jobが日曜21時JSTにOIDC付きでジョブURLを呼ぶ", async () => {
  const production = await read("infra/terraform/environments/prod/main.tf");
  const outputs = await read("infra/terraform/environments/prod/outputs.tf");

  assert.match(
    production,
    /resource\s+"google_cloud_scheduler_job"\s+"weekly_line_report"\s*\{\s*count\s*=\s*local\.line_weekly_report_enabled/s,
  );
  assert.match(production, /schedule\s*=\s*"0 21 \* \* 0"/);
  assert.match(production, /time_zone\s*=\s*"Asia\/Tokyo"/);
  assert.match(production, /http_method\s*=\s*"POST"/);
  assert.match(
    production,
    /paused\s*=\s*local\.line_weekly_report_settings\.paused/,
  );
  assert.match(production, /retry_config\s*\{/);
  assert.match(
    production,
    /weekly_line_report_job_url\s*=\s*"\$\{var\.site_url\}\/api\/v1\/jobs\/weekly-line-report"/,
  );
  assert.match(production, /uri\s*=\s*local\.weekly_line_report_job_url/);
  assert.match(production, /audience\s*=\s*local\.weekly_line_report_job_url/);
  assert.match(
    production,
    /LINE_WEEKLY_REPORT_JOB_AUDIENCE\s*=\s*local\.weekly_line_report_job_url/,
  );
  assert.match(
    production,
    /LINE_WEEKLY_REPORT_JOB_INVOKER\s*=\s*one\(data\.google_service_account\.scheduler\[\*\]\.email\)/,
  );
  assert.match(
    production,
    /service_account_email\s*=\s*one\(data\.google_service_account\.scheduler\[\*\]\.email\)/,
  );
  // run.invokerはallUsersの1件だけ。scheduler SAへ付けない（AC-INF-001-8, INF-020）
  assert.equal(production.match(/roles\/run\.invoker/g)?.length, 1);
  assert.doesNotMatch(production, /google_project_iam_member/);
  assert.match(outputs, /weekly_line_report_job_name/);
});

// AC-INF-001-27: 運用資料が有効化順序・pause・無効化・確認手順を説明する
test("運用資料がLINE週次レポートのインフラ有効化手順を説明する", async () => {
  const terraformGuide = await read("infra/terraform/README.md");
  const operationsGuide = await read("docs/operations/line-weekly-report.md");

  for (const phrase of [
    "LINE週次レポート",
    "Cloud Scheduler",
    "line_weekly_report",
    "gcloud secrets versions add",
    "paused",
  ]) {
    assert.match(terraformGuide, new RegExp(phrase));
  }
  for (const phrase of [
    "line_weekly_report",
    "channel_secret_version",
    "paused = true",
    "gcloud scheduler jobs run",
    "cloudscheduler.serviceAgent",
  ]) {
    assert.match(operationsGuide, new RegExp(phrase));
  }
  // 接続文字列などの秘密値の実値を含まない
  assert.doesNotMatch(operationsGuide, /postgresql:\/\/line_notifier:[^<]/);
});
