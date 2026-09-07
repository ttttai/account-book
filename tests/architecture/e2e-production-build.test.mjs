import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// review: 2026-09-08-ci-e2e-production-build
test("NFR-E2E-003: E2E stackのアプリは本番buildで動き、開発用stackの定義は変えない", async () => {
  const override = await read("compose.e2e.yaml");
  const baseCompose = await read("compose.yaml");
  const stackScript = await read("scripts/e2e-stack.sh");
  const specification = await read("specs/15-e2e-testing.md");
  const requirements = await read("specs/06-non-functional-requirements.md");

  // webだけを本番Dockerfileへ差し替え、開発用imageを使わない
  assert.match(override, /^\s+web:\n/m);
  assert.match(override, /dockerfile: Dockerfile$/m);
  assert.doesNotMatch(override, /docker\/development\/Dockerfile/);
  // NEXT_PUBLIC_*はbuild時にclient bundleへ埋め込まれるため、.env.e2eの値をbuild argへ渡す
  for (const name of [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED",
  ]) {
    assert.match(override, new RegExp(`${name}: \\$\\{${name}`));
  }
  // secretと許可リストはbuild argへ渡さない
  assert.doesNotMatch(
    override,
    /POSTGRES_PASSWORD|SUPABASE_JWT_SECRET|GOOGLE_OAUTH_CLIENT_SECRET|AUTH_ALLOWED_GOOGLE_EMAILS/,
  );

  // 開発用stackは開発用Dockerfileのままで、E2Eだけがoverrideを重ねる
  assert.match(baseCompose, /dockerfile: docker\/development\/Dockerfile/);
  assert.match(
    stackScript,
    /--file "\$project_root\/compose\.yaml" --file "\$project_root\/compose\.e2e\.yaml"/,
  );
  // 変更前のimageで検証しないよう、起動ごとにbuildする
  assert.match(stackScript, /compose up --build/);

  assert.match(requirements, /NFR-E2E-003`[^\n]*本番buildで実行/);
  assert.match(specification, /アプリの実行形態 \| 本番build/);
  assert.doesNotMatch(specification, /`next dev`で動く/);
});

test("NFR-E2E-003: Playwrightのtimeoutはcompile時間を含めない上限内にする", async () => {
  const playwrightConfig = await read("playwright.config.ts");

  const timeoutOf = (pattern) => {
    const matched = playwrightConfig.match(pattern);
    assert.ok(matched, `${pattern}に一致するtimeout設定が必要です`);
    return Number(matched[1].replaceAll("_", ""));
  };
  // 上限は15-e2e-testing.md §4の表と一致させる
  assert.ok(timeoutOf(/^\s+timeout: ([\d_]+),/m) <= 60_000);
  assert.ok(timeoutOf(/navigationTimeout: ([\d_]+)/) <= 30_000);
  assert.ok(timeoutOf(/actionTimeout: ([\d_]+)/) <= 15_000);
  assert.ok(timeoutOf(/expect: \{ timeout: ([\d_]+) \}/) <= 10_000);
  assert.doesNotMatch(playwrightConfig, /next dev/);
});

test("NFR-E2E-001: CIはPlaywrightのbrowserをversion keyのcacheで再利用する", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  const e2eJob = workflow.slice(
    workflow.indexOf("\n  e2e:"),
    workflow.indexOf("\n  integration:"),
  );

  assert.match(e2eJob, /actions\/cache@[0-9a-f]{40}/);
  assert.match(e2eJob, /path: ~\/\.cache\/ms-playwright/);
  assert.match(
    e2eJob,
    /key: playwright-\$\{\{ runner\.os \}\}-\$\{\{ steps\.playwright\.outputs\.version \}\}/,
  );
  // cache missのときだけbrowserをdownloadし、cache hit時もOS依存packageは導入する
  assert.match(
    e2eJob,
    /cache-hit != 'true'\n\s+run: npx playwright install --with-deps chromium/,
  );
  assert.match(
    e2eJob,
    /cache-hit == 'true'\n\s+run: npx playwright install-deps chromium/,
  );
  // stack logの取得はscript経由でoverride fileを含める
  assert.match(e2eJob, /sh scripts\/e2e-stack\.sh logs/);
});
