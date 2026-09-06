import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// INF-018 / AC-INF-001-21〜23: 許可リストrotation補助scriptを、実credentialなしにstub commandで検証する

const scriptPath = path.resolve("scripts/rotate-allowed-google-emails.sh");
const runbookPath = "docs/operations/allowed-google-emails.md";
const stubSecretId = "stub-allowed-google-emails";
const stubProjectId = "stub-project";

// stubのgcloudとpsql、Git管理外相当のtfvarsを一時directoryへ用意する
async function createStubEnvironment({
  currentVersion = "7",
  secretValue = "a@example.test,b@example.test",
  syncedCount = "2",
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "allowlist-rotation-"));
  const bin = path.join(root, "bin");
  await mkdir(bin);

  const gcloudStub = `#!/bin/sh
printf '%s\\n' "$*" >> "${root}/gcloud-args.log"
case "$*" in
  *"secrets versions add"*)
    cat > "${root}/gcloud-stdin.txt"
    printf 'projects/123456/secrets/${stubSecretId}/versions/8\\n'
    ;;
  *"secrets versions access"*)
    cat "${root}/secret-value.txt"
    ;;
  *)
    echo "unexpected gcloud invocation" >&2
    exit 9
    ;;
esac
`;
  const psqlStub = `#!/bin/sh
printf '%s\\n' "$*" >> "${root}/psql-args.log"
cat > "${root}/psql-stdin.sql"
printf '${syncedCount}\\n'
`;
  await writeFile(path.join(bin, "gcloud"), gcloudStub);
  await writeFile(path.join(bin, "psql"), psqlStub);
  await chmod(path.join(bin, "gcloud"), 0o755);
  await chmod(path.join(bin, "psql"), 0o755);
  await writeFile(path.join(root, "secret-value.txt"), secretValue);

  const tfvarsPath = path.join(root, "terraform.tfvars");
  await writeFile(
    tfvarsPath,
    [
      `project_id = "${stubProjectId}"`,
      'region     = "asia-northeast1"',
      "",
      `allowed_google_emails_secret_id = "${stubSecretId}"`,
      `allowed_google_emails_version = "${currentVersion}"`,
      "",
    ].join("\n"),
  );

  return {
    root,
    tfvarsPath,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      PROD_TFVARS_FILE: tfvarsPath,
      PROD_ENV_FILE: path.join(root, "missing.env"),
      PROD_DB_URL: "postgresql://stub-user@stub-host:5432/postgres",
    },
  };
}

// scriptを標準入力付きで実行し、終了code・標準出力・標準エラー出力を返す
function runScript(args, { env, input = "" }) {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", [scriptPath, ...args], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

test("rotation scriptは実行可能で、runbookと運用資料から参照されている", async () => {
  const scriptStat = await stat(scriptPath);
  assert.ok(scriptStat.mode & 0o111, "scriptに実行権限が必要です");

  const runbook = await readFile(runbookPath, "utf8");
  assert.match(runbook, /rotate-allowed-google-emails\.sh add-version/);
  assert.match(runbook, /rotate-allowed-google-emails\.sh sync-db/);
  assert.match(runbook, /terraform plan/);
  assert.match(runbook, /gcloud secrets versions disable/);

  for (const referrer of [
    "docs/operations/deployment.md",
    "docs/operations/database-changes.md",
    "infra/terraform/README.md",
  ]) {
    const content = await readFile(referrer, "utf8");
    assert.match(
      content,
      /allowed-google-emails\.md/,
      `${referrer}からrunbookを参照する必要があります`,
    );
  }

  const spec = await readFile("specs/11-production-infrastructure.md", "utf8");
  assert.match(spec, /^- `INF-018`/m);
  for (const id of ["AC-INF-001-21", "AC-INF-001-22", "AC-INF-001-23"]) {
    assert.match(spec, new RegExp(`^- \`${id}\``, "m"));
  }
});

test("add-versionは不正な許可リストを、secretを作らずに中止する", async () => {
  const cases = [
    { name: "空入力", input: "\n" },
    {
      name: "重複（大文字小文字を無視）",
      input: "a@example.test,A@example.test\n",
    },
    { name: "不正形式", input: "a@example.test,not-an-email\n" },
    { name: "空要素", input: "a@example.test,,b@example.test\n" },
    { name: "複数行", input: "a@example.test\nb@example.test\n" },
  ];

  for (const testCase of cases) {
    const stub = await createStubEnvironment();
    const result = await runScript(["add-version"], {
      env: stub.env,
      input: testCase.input,
    });
    assert.notEqual(result.code, 0, `${testCase.name}は中止する必要があります`);
    assert.equal(
      await readOptional(path.join(stub.root, "gcloud-args.log")),
      null,
      `${testCase.name}でgcloudを呼んではいけません`,
    );
    assert.match(
      await readFile(stub.tfvarsPath, "utf8"),
      /allowed_google_emails_version = "7"/,
    );
    assert.doesNotMatch(result.stdout + result.stderr, /example\.test/);
  }
});

test("add-versionは正規化した許可リストを標準入力でgcloudへ渡し、tfvarsのversionを更新する", async () => {
  const stub = await createStubEnvironment();
  const result = await runScript(["add-version"], {
    env: stub.env,
    input: " B@Example.test , a@example.test\n",
  });
  assert.equal(result.code, 0, result.stderr);

  const gcloudArgs = await readFile(
    path.join(stub.root, "gcloud-args.log"),
    "utf8",
  );
  assert.match(
    gcloudArgs,
    new RegExp(
      `secrets versions add ${stubSecretId} --project=${stubProjectId} --data-file=-`,
    ),
  );
  assert.doesNotMatch(gcloudArgs, /example\.test/);
  assert.equal(
    await readFile(path.join(stub.root, "gcloud-stdin.txt"), "utf8"),
    "b@example.test,a@example.test",
  );

  const tfvars = await readFile(stub.tfvarsPath, "utf8");
  assert.match(tfvars, /^allowed_google_emails_version = "8"$/m);
  assert.doesNotMatch(tfvars, /"7"/);
  assert.match(tfvars, /^project_id = "stub-project"$/m);

  const output = result.stdout + result.stderr;
  assert.doesNotMatch(output, /example\.test/);
  assert.match(result.stdout, /terraform plan/);
  assert.match(result.stdout, /rotate-allowed-google-emails\.sh sync-db 8/);
  assert.match(
    result.stdout,
    new RegExp(
      `gcloud secrets versions disable 7 --secret=${stubSecretId} --project=${stubProjectId}`,
    ),
  );
});

test("sync-dbはSecret Managerの指定versionをpsqlの標準入力経由で同期する", async () => {
  const stub = await createStubEnvironment({ currentVersion: "8" });
  const result = await runScript(["sync-db", "8"], { env: stub.env });
  assert.equal(result.code, 0, result.stderr);

  const gcloudArgs = await readFile(
    path.join(stub.root, "gcloud-args.log"),
    "utf8",
  );
  assert.match(
    gcloudArgs,
    new RegExp(
      `secrets versions access 8 --secret=${stubSecretId} --project=${stubProjectId}`,
    ),
  );

  const psqlArgs = await readFile(
    path.join(stub.root, "psql-args.log"),
    "utf8",
  );
  assert.match(psqlArgs, /postgresql:\/\/stub-user@stub-host:5432\/postgres/);
  assert.match(psqlArgs, /ON_ERROR_STOP=1/);
  assert.doesNotMatch(psqlArgs, /example\.test/);

  const psqlStdin = await readFile(
    path.join(stub.root, "psql-stdin.sql"),
    "utf8",
  );
  assert.match(
    psqlStdin,
    /\\set allowed_google_accounts 'a@example\.test,b@example\.test'/,
  );
  assert.match(
    psqlStdin,
    /select app_private\.sync_allowed_google_accounts\(:'allowed_google_accounts'\)/,
  );

  assert.doesNotMatch(result.stdout + result.stderr, /example\.test/);
  assert.match(result.stdout, /2/);
});

test("sync-dbはsecret値が不正な場合とDBが全件を無効化した場合に失敗する", async () => {
  const invalid = await createStubEnvironment({
    secretValue: "a@example.test,a@example.test",
  });
  const invalidResult = await runScript(["sync-db", "8"], { env: invalid.env });
  assert.notEqual(invalidResult.code, 0);
  assert.equal(
    await readOptional(path.join(invalid.root, "psql-args.log")),
    null,
    "不正なsecret値でpsqlを呼んではいけません",
  );
  assert.doesNotMatch(
    invalidResult.stdout + invalidResult.stderr,
    /example\.test/,
  );

  const rejected = await createStubEnvironment({ syncedCount: "0" });
  const rejectedResult = await runScript(["sync-db", "8"], {
    env: rejected.env,
  });
  assert.notEqual(
    rejectedResult.code,
    0,
    "同期件数が一致しない場合は失敗する必要があります",
  );
  assert.doesNotMatch(
    rejectedResult.stdout + rejectedResult.stderr,
    /example\.test/,
  );
});

test("sync-dbは接続文字列が無い場合とversionが不正な場合に何も実行しない", async () => {
  const missingUrl = await createStubEnvironment();
  delete missingUrl.env.PROD_DB_URL;
  const missingResult = await runScript(["sync-db", "8"], {
    env: missingUrl.env,
  });
  assert.notEqual(missingResult.code, 0);
  assert.match(missingResult.stderr, /PROD_DB_URL/);
  assert.equal(
    await readOptional(path.join(missingUrl.root, "psql-args.log")),
    null,
  );

  const badVersion = await createStubEnvironment();
  const badResult = await runScript(["sync-db", "latest"], {
    env: badVersion.env,
  });
  assert.notEqual(badResult.code, 0);
  assert.equal(
    await readOptional(path.join(badVersion.root, "gcloud-args.log")),
    null,
  );
});
