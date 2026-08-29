import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

async function exists(path) {
  try {
    await stat(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

test("bootstrapとproductionを独立したTerraform rootに分離する", async () => {
  for (const path of [
    "infra/terraform/bootstrap/main.tf",
    "infra/terraform/bootstrap/versions.tf",
    "infra/terraform/bootstrap/variables.tf",
    "infra/terraform/bootstrap/outputs.tf",
    "infra/terraform/bootstrap/terraform.tfvars.example",
    "infra/terraform/environments/prod/main.tf",
    "infra/terraform/environments/prod/versions.tf",
    "infra/terraform/environments/prod/variables.tf",
    "infra/terraform/environments/prod/outputs.tf",
    "infra/terraform/environments/prod/backend.hcl.example",
    "infra/terraform/environments/prod/terraform.tfvars.example",
    "infra/terraform/README.md",
  ]) {
    assert.equal(await exists(path), true, `${path}が必要です`);
  }
});

test("bootstrapで必要APIと削除保護したremote stateを宣言する", async () => {
  const bootstrap = [
    await read("infra/terraform/bootstrap/main.tf"),
    await read("infra/terraform/bootstrap/variables.tf"),
  ].join("\n");

  for (const service of [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
  ]) {
    assert.match(bootstrap, new RegExp(service.replaceAll(".", "\\.")));
  }

  assert.match(
    bootstrap,
    /resource\s+"google_storage_bucket"\s+"terraform_state"/,
  );
  assert.match(bootstrap, /uniform_bucket_level_access\s*=\s*true/);
  assert.match(bootstrap, /public_access_prevention\s*=\s*"enforced"/);
  assert.match(bootstrap, /force_destroy\s*=\s*false/);
  assert.match(bootstrap, /versioning\s*\{\s*enabled\s*=\s*true/s);
  assert.match(bootstrap, /lifecycle\s*\{\s*prevent_destroy\s*=\s*true/s);
});

test("Artifact Registry、budget、keyなしruntime identityを宣言する", async () => {
  const bootstrap = await read("infra/terraform/bootstrap/main.tf");

  assert.match(
    bootstrap,
    /resource\s+"google_artifact_registry_repository"\s+"app"/,
  );
  assert.match(bootstrap, /format\s*=\s*"DOCKER"/);
  assert.match(bootstrap, /cleanup_policy_dry_run\s*=\s*true/);
  assert.match(bootstrap, /resource\s+"google_billing_budget"\s+"monthly"/);
  for (const threshold of ["0.5", "0.8", "1.0"]) {
    assert.match(
      bootstrap,
      new RegExp(`threshold_percent\\s*=\\s*${threshold}`),
    );
  }

  assert.match(bootstrap, /resource\s+"google_service_account"\s+"cloud_run"/);
  assert.doesNotMatch(bootstrap, /google_service_account_key/);
});

test("secret payloadをstateへ保存せず対象secretだけへ権限を付ける", async () => {
  const bootstrap = await read("infra/terraform/bootstrap/main.tf");
  const production = await read("infra/terraform/environments/prod/main.tf");

  assert.match(
    bootstrap,
    /resource\s+"google_secret_manager_secret"\s+"allowed_google_emails"/,
  );
  assert.match(
    bootstrap,
    /resource\s+"google_secret_manager_secret_iam_member"\s+"cloud_run_accessor"/,
  );
  assert.match(bootstrap, /roles\/secretmanager\.secretAccessor/);
  assert.doesNotMatch(bootstrap, /google_secret_manager_secret_version/);
  assert.doesNotMatch(bootstrap, /secret_data\s*=/);

  assert.match(production, /name\s*=\s*"AUTH_ALLOWED_GOOGLE_EMAILS"/);
  assert.match(production, /version\s*=\s*var\.allowed_google_emails_version/);
  assert.doesNotMatch(production, /version\s*=\s*"latest"/);
});

test("Cloud Runを低コスト・削除保護・digest固定で宣言する", async () => {
  const production = [
    await read("infra/terraform/environments/prod/main.tf"),
    await read("infra/terraform/environments/prod/variables.tf"),
  ].join("\n");

  assert.match(production, /resource\s+"google_cloud_run_v2_service"\s+"app"/);
  assert.match(production, /default\s*=\s*"asia-northeast1"/);
  assert.match(production, /deletion_protection\s*=\s*true/);
  assert.match(
    production,
    /execution_environment\s*=\s*"EXECUTION_ENVIRONMENT_GEN2"/,
  );
  assert.match(production, /cpu_idle\s*=\s*true/);
  assert.match(production, /"cpu"\s*=\s*"1"/);
  assert.match(production, /"memory"\s*=\s*"512Mi"/);
  assert.match(production, /min_instance_count\s*=\s*0/);
  assert.match(production, /max_instance_count\s*=\s*3/);
  assert.match(production, /container_port\s*=\s*8080/);
  assert.doesNotMatch(production, /name\s*=\s*"PORT"/);

  assert.match(production, /@sha256:/);
  assert.match(production, /\[a-f0-9\]\{64\}/);
  assert.doesNotMatch(production, /:latest/);
});

test("公開Web入口と必要最小限のruntime設定だけを渡す", async () => {
  const production = await read("infra/terraform/environments/prod/main.tf");
  const dockerfile = await read("Dockerfile");

  assert.match(
    production,
    /resource\s+"google_cloud_run_v2_service_iam_member"\s+"public"/,
  );
  assert.match(production, /role\s*=\s*"roles\/run\.invoker"/);
  assert.match(production, /member\s*=\s*"allUsers"/);

  for (const environmentName of [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED",
  ]) {
    assert.match(production, new RegExp(environmentName));
    assert.match(dockerfile, new RegExp(`ARG ${environmentName}=`));
    assert.match(dockerfile, new RegExp(`ENV ${environmentName}=`));
  }
  assert.doesNotMatch(production, /SERVICE_ROLE|GOOGLE_OAUTH_CLIENT_SECRET/);
});

test("Terraform生成物と実値をGit管理から除外する", async () => {
  const gitignore = await read(".gitignore");
  const dockerignore = await read(".dockerignore");

  for (const pattern of [
    ".terraform",
    "*.tfstate",
    "*.tfstate.*",
    "*.tfplan",
    "*.tfvars",
    "backend.hcl",
  ]) {
    assert.match(gitignore, new RegExp(pattern.replaceAll("*", "\\*")));
  }
  assert.match(gitignore, /!.*\.example/);
  assert.doesNotMatch(gitignore, /^\.terraform\.lock\.hcl$|^\*\.hcl$/m);

  for (const pattern of [
    ".terraform",
    "*.tfstate",
    "*.tfstate.*",
    "*.tfplan",
    "*.tfvars",
    "backend.hcl",
  ]) {
    assert.match(dockerignore, new RegExp(pattern.replaceAll("*", "\\*")));
  }
});

test("日本語運用資料に初回構築・secret・rollback・確認手順を残す", async () => {
  const operations = await read("infra/terraform/README.md");

  for (const phrase of [
    "初回構築",
    "backend移行",
    "Secret Manager",
    "NEXT_PUBLIC_",
    "digest",
    "plan確認",
    "ロールバック",
    "スモークテスト",
    "Supabase",
    "Google OAuth",
    "terraform apply",
  ]) {
    assert.match(operations, new RegExp(phrase));
  }
  assert.match(operations, /本PRでは.*apply.*行わない/s);
});
