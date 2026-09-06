import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// INF-022 (AC-INF-001-28): LINE不具合報告用のsecret containerをbootstrapで宣言し、payloadは管理しない
test("bootstrapがLINE不具合報告用secret container 2つとsecret単位accessorを宣言する", async () => {
  const bootstrap = await read("infra/terraform/bootstrap/main.tf");
  const variables = await read("infra/terraform/bootstrap/variables.tf");
  const outputs = await read("infra/terraform/bootstrap/outputs.tf");

  assert.match(
    bootstrap,
    /resource\s+"google_secret_manager_secret"\s+"line_bug_report"\s*\{\s*for_each\s*=\s*tomap\(var\.line_bug_report_secret_ids\)/s,
  );
  assert.match(
    bootstrap,
    /resource\s+"google_secret_manager_secret_iam_member"\s+"line_bug_report_cloud_run_accessor"\s*\{\s*for_each\s*=\s*google_secret_manager_secret\.line_bug_report/s,
  );
  // payloadはTerraform管理外（INF-022）
  assert.doesNotMatch(bootstrap, /google_secret_manager_secret_version/);
  assert.doesNotMatch(bootstrap, /secret_data\s*=/);
  // accessorはruntime SAだけ
  const accessorBlock = bootstrap.slice(
    bootstrap.indexOf('"line_bug_report_cloud_run_accessor"'),
  );
  assert.match(
    accessorBlock,
    /member\s*=\s*"serviceAccount:\$\{google_service_account\.cloud_run\.email\}"/,
  );
  assert.equal(
    bootstrap.match(/roles\/secretmanager\.secretAccessor/g)?.length,
    3,
  );

  for (const secretId of [
    "account-book-line-bug-report-github-token",
    "account-book-line-bug-report-allowed-user-ids",
  ]) {
    assert.match(variables, new RegExp(secretId));
  }
  assert.match(
    variables,
    /variable\s+"line_bug_report_secret_ids"\s*\{[\s\S]*?github_token\s*=\s*string[\s\S]*?allowed_user_ids\s*=\s*string/,
  );
  assert.match(outputs, /google_secret_manager_secret\.line_bug_report/);
});

// INF-023 (AC-INF-001-29): 既定nullで何も宣言せず、有効時だけ固定versionのsecret環境変数を渡す
test("prodのLINE不具合報告構成は既定で無効、有効時だけ環境変数3つを宣言する", async () => {
  const production = await read("infra/terraform/environments/prod/main.tf");
  const variables = await read(
    "infra/terraform/environments/prod/variables.tf",
  );

  assert.match(
    variables,
    /variable\s+"line_bug_report"\s*\{[\s\S]*?default\s*=\s*null/,
  );
  // owner/repo形式とversion番号だけを受け付ける
  const bugReportVariable = variables.slice(
    variables.indexOf('variable "line_bug_report" {'),
  );
  assert.match(bugReportVariable, /github_repository\s*=\s*string/);
  assert.match(bugReportVariable, /\[A-Za-z0-9\]\[A-Za-z0-9-\]\{0,38\}\//);
  assert.match(bugReportVariable, /\^\[1-9\]\[0-9\]\*\$/);
  assert.doesNotMatch(bugReportVariable, /paused/);

  assert.match(
    production,
    /line_bug_report_enabled\s*=\s*var\.line_bug_report\s*!=\s*null/,
  );
  assert.match(
    production,
    /data\s+"google_secret_manager_secret"\s+"line_bug_report"\s*\{\s*for_each\s*=\s*\{[^}]*if local\.line_bug_report_enabled\s*\}/s,
  );
  for (const secretName of [
    "LINE_BUG_REPORT_GITHUB_TOKEN",
    "LINE_BUG_REPORT_ALLOWED_USER_IDS",
  ]) {
    assert.match(production, new RegExp(`${secretName}\\s*=\\s*\\{`));
  }
  assert.match(production, /LINE_BUG_REPORT_GITHUB_REPOSITORY\s*=/);
  assert.match(
    production,
    /dynamic\s+"env"\s*\{\s*for_each\s*=\s*local\.line_bug_report_secret_env/s,
  );
  assert.match(
    production,
    /dynamic\s+"env"\s*\{\s*for_each\s*=\s*local\.line_bug_report_plain_env/s,
  );
  assert.match(production, /if\s+local\.line_bug_report_enabled/);
  assert.match(
    production,
    /data\.google_secret_manager_secret\.line_bug_report\[env\.value\.key\]\.secret_id/,
  );
  assert.match(production, /github_token_version/);
  assert.match(production, /allowed_user_ids_version/);
  assert.doesNotMatch(production, /version\s*=\s*"latest"/);
});

// INF-024 (AC-INF-001-30): 週次レポートの設定が前提で、週次レポート側の宣言を変えない
test("line_bug_reportはline_weekly_reportを前提とし、週次レポートの構成を変えない", async () => {
  const production = await read("infra/terraform/environments/prod/main.tf");
  const variables = await read(
    "infra/terraform/environments/prod/variables.tf",
  );

  const bugReportVariable = variables.slice(
    variables.indexOf('variable "line_bug_report" {'),
  );
  assert.match(
    bugReportVariable,
    /condition\s*=\s*var\.line_bug_report\s*==\s*null\s*\|\|\s*var\.line_weekly_report\s*!=\s*null/,
  );

  // 週次レポートの環境変数6つとCloud Scheduler jobは、週次レポートの変数だけで決まる
  const weeklySection = production.slice(
    production.indexOf("line_weekly_report_secret_env = {"),
    production.indexOf("line_bug_report_enabled"),
  );
  assert.doesNotMatch(weeklySection, /line_bug_report/);
  const schedulerJob = production.slice(
    production.indexOf(
      'resource "google_cloud_scheduler_job" "weekly_line_report"',
    ),
  );
  assert.doesNotMatch(schedulerJob, /line_bug_report/);
  // Cloud Scheduler jobとscheduler SAの宣言数は変わらない
  assert.equal(
    production.match(/resource\s+"google_cloud_scheduler_job"/g)?.length,
    1,
  );
  assert.equal(production.match(/roles\/run\.invoker/g)?.length, 1);
  assert.doesNotMatch(production, /google_project_iam_member/);
  // 起票用に新しいservice account・IAM・jobを作らない
  const bootstrap = await read("infra/terraform/bootstrap/main.tf");
  assert.equal(
    bootstrap.match(/resource\s+"google_service_account"/g)?.length,
    3,
  );
});

// AC-INF-001-31: 運用資料が有効化順序・無効化・rotation・確認手順を説明する
test("運用資料がLINE不具合報告のインフラ有効化手順を説明する", async () => {
  const terraformGuide = await read("infra/terraform/README.md");
  const operationsGuide = await read("docs/operations/line-bug-report.md");
  const example = await read(
    "infra/terraform/environments/prod/terraform.tfvars.example",
  );

  for (const phrase of [
    "LINE不具合報告",
    "line_bug_report",
    "gcloud secrets versions add",
    "line_weekly_report",
    "rotation",
  ]) {
    assert.match(terraformGuide, new RegExp(phrase), phrase);
  }
  for (const phrase of [
    "line_bug_report",
    "github_token_version",
    "allowed_user_ids_version",
    "update in-place",
    "terraform plan",
    "line-bug-report-infra",
  ]) {
    assert.match(operationsGuide, new RegExp(phrase), phrase);
  }
  assert.match(example, /# line_bug_report = \{/);
  // tokenの実値やuserIdの実値を含まない
  assert.doesNotMatch(example, /github_pat_[A-Za-z0-9_]{10,}/);
  assert.doesNotMatch(operationsGuide, /github_pat_[A-Za-z0-9_]{10,}/);
});
