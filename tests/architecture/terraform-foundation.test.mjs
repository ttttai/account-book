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
    ".github/workflows/deploy-production.yml",
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
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
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

test("Artifact Registry、budget、keyなしruntime・deploy identityを宣言する", async () => {
  const bootstrap = await read("infra/terraform/bootstrap/main.tf");

  assert.match(
    bootstrap,
    /resource\s+"google_artifact_registry_repository"\s+"app"/,
  );
  assert.match(bootstrap, /format\s*=\s*"DOCKER"/);
  assert.match(bootstrap, /cleanup_policy_dry_run\s*=\s*true/);
  assert.match(bootstrap, /resource\s+"google_billing_budget"\s+"monthly"/);
  assert.match(
    bootstrap,
    /billing_account\s*=\s*trimprefix\(var\.billing_account_id,\s*"billingAccounts\/"\)/,
  );
  for (const threshold of ["0.5", "0.8", "1.0"]) {
    assert.match(
      bootstrap,
      new RegExp(`threshold_percent\\s*=\\s*${threshold}`),
    );
  }

  assert.match(bootstrap, /resource\s+"google_service_account"\s+"cloud_run"/);
  assert.match(
    bootstrap,
    /resource\s+"google_service_account"\s+"github_deploy"/,
  );
  assert.doesNotMatch(bootstrap, /google_service_account_key/);
});

test("GitHub Actionsを不変repository IDとmain branchへ制約したWIFで認証する", async () => {
  const bootstrap = [
    await read("infra/terraform/bootstrap/main.tf"),
    await read("infra/terraform/bootstrap/variables.tf"),
  ].join("\n");

  assert.match(
    bootstrap,
    /resource\s+"google_iam_workload_identity_pool"\s+"github"/,
  );
  assert.match(
    bootstrap,
    /resource\s+"google_iam_workload_identity_pool_provider"\s+"github"/,
  );
  assert.match(bootstrap, /https:\/\/token\.actions\.githubusercontent\.com/);
  assert.match(
    bootstrap,
    /"attribute\.repository_id"\s*=\s*"assertion\.repository_id"/,
  );
  assert.match(
    bootstrap,
    /"attribute\.repository_owner_id"\s*=\s*"assertion\.repository_owner_id"/,
  );
  assert.match(
    bootstrap,
    /assertion\.repository_id\s*==\s*'\$\{var\.github_repository_id\}'/,
  );
  assert.match(
    bootstrap,
    /assertion\.repository_owner_id\s*==\s*'\$\{var\.github_repository_owner_id\}'/,
  );
  assert.match(bootstrap, /assertion\.ref\s*==\s*'refs\/heads\/main'/);
  assert.match(bootstrap, /roles\/iam\.workloadIdentityUser/);
  assert.match(bootstrap, /roles\/artifactregistry\.writer/);
  assert.match(bootstrap, /roles\/iam\.serviceAccountUser/);
  assert.doesNotMatch(bootstrap, /assertion\.repository\s*==/);
  assert.doesNotMatch(
    bootstrap,
    /resource\s+"google_project_iam_member"\s+"github_deploy"/,
  );
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

test("Cloud Runを低コスト・削除保護・初回digest固定で宣言する", async () => {
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
  assert.match(production, /image\s*=\s*var\.initial_container_image/);
  assert.match(
    production,
    /ignore_changes\s*=\s*\[\s*template\[0\]\.containers\[0\]\.image,?\s*\]/s,
  );
  assert.doesNotMatch(production, /ignore_changes\s*=\s*\[\s*template,?\s*\]/s);
  assert.doesNotMatch(production, /variable\s+"container_image"/);
});

test("deploy identityのCloud Run権限を対象serviceだけに付ける", async () => {
  const production = await read("infra/terraform/environments/prod/main.tf");

  assert.match(
    production,
    /resource\s+"google_cloud_run_v2_service_iam_member"\s+"github_deploy"/,
  );
  assert.match(production, /role\s*=\s*"roles\/run\.developer"/);
  assert.match(
    production,
    /member\s*=\s*"serviceAccount:\$\{data\.google_service_account\.github_deploy\.email\}"/,
  );
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
    "*_override.tf",
    "gha-creds-*.json",
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
    "*_override.tf",
    "gha-creds-*.json",
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

test("production CDはmainのCI成功後にWIFでdigestだけをdeployする", async () => {
  const workflow = await read(".github/workflows/deploy-production.yml");

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\["CI"\]/);
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /github\.event\.workflow_run\.conclusion\s*==\s*'success'/,
  );
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /vars\.PRODUCTION_CD_ENABLED\s*==\s*'true'/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /google-github-actions\/auth@[0-9a-f]{40}/);
  assert.match(workflow, /workload_identity_provider:/);
  assert.match(workflow, /service_account:/);
  assert.doesNotMatch(workflow, /credentials_json|service-account-key/);
  assert.match(workflow, /docker build/);
  assert.match(workflow, /docker push/);
  assert.match(workflow, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(
    workflow,
    /image_with_digest="\$\{IMAGE_TAG%:\*\}@\$\{digest\}"/,
  );
  assert.match(workflow, /gcloud run deploy/);
  assert.match(workflow, /gcloud run services describe/);
  assert.match(workflow, /curl --fail/);

  for (const forbiddenFlag of [
    "--set-env-vars",
    "--update-env-vars",
    "--set-secrets",
    "--update-secrets",
    "--service-account",
    "--cpu",
    "--memory",
    "--min-instances",
    "--max-instances",
    "--ingress",
    "--allow-unauthenticated",
  ]) {
    assert.doesNotMatch(workflow, new RegExp(forbiddenFlag));
  }

  for (const forbiddenSecret of [
    "AUTH_ALLOWED_GOOGLE_EMAILS",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assert.doesNotMatch(workflow, new RegExp(forbiddenSecret));
  }
});
