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

test("Next.js App Routerを機能単位の構成で利用する", async () => {
  assert.equal(await exists("src/app/layout.tsx"), true);
  assert.equal(await exists("src/app/page.tsx"), true);
  assert.equal(await exists("src/modules/README.md"), true);
});

test("TypeScript strict modeと品質ゲートを設定する", async () => {
  const tsconfig = JSON.parse(await read("tsconfig.json"));
  const packageJson = JSON.parse(await read("package.json"));

  assert.equal(tsconfig.compilerOptions.strict, true);
  for (const script of [
    "format:check",
    "lint",
    "typecheck",
    "test",
    "test:architecture",
    "test:coverage",
    "build",
  ]) {
    assert.equal(
      typeof packageJson.scripts[script],
      "string",
      `${script}が必要です`,
    );
  }
  assert.equal(await exists("tests/integration/auth-local.sql"), true);
  assert.equal(
    await exists("tests/integration/groups-sharing-local.sql"),
    true,
  );
});

test("未実行moduleを含むcoverageをCIで50%以上に保つ (NFR-MNT-012)", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const vitestConfig = await read("vitest.config.ts");
  const workflow = await read(".github/workflows/ci.yml");

  assert.equal(
    packageJson.scripts["test:coverage"],
    "vitest run --coverage.enabled",
  );
  assert.equal(
    packageJson.devDependencies["@vitest/coverage-istanbul"],
    packageJson.devDependencies.vitest,
  );
  assert.match(vitestConfig, /provider:\s*"istanbul"/);
  assert.match(
    vitestConfig,
    /include:\s*\["src\/modules\/\*\*\/\*\.\{ts,tsx\}"\]/,
  );
  assert.match(vitestConfig, /src\/modules\/\*\*\/\*\.test\.\{ts,tsx\}/);
  assert.match(vitestConfig, /src\/modules\/\*\*\/\*-types\.ts/);
  assert.match(
    vitestConfig,
    /src\/modules\/\*\/\{index,server,presentation\}\.ts/,
  );
  for (const metric of ["statements", "branches", "functions", "lines"]) {
    assert.match(vitestConfig, new RegExp(`${metric}:\\s*50`));
  }
  assert.match(workflow, /npm run test:coverage/);
  assert.match(workflow, /npm run test:architecture/);
  assert.doesNotMatch(
    workflow,
    /^\s*run:\s*npm test\s*$/m,
    "CIではcoverageなしのVitestを重複実行しません",
  );
});

test("Docker Composeを標準のローカル開発入口にする", async () => {
  const compose = await read("compose.yaml");

  assert.match(compose, /develop:\s*\n\s+watch:/);
  assert.match(compose, /action:\s*sync/);
  assert.match(compose, /action:\s*rebuild/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /127\.0\.0\.1:\$\{WEB_HOST_PORT:-3000\}:3000/);
});

test("開発・本番コンテナは非rootユーザーで実行する", async () => {
  const developmentDockerfile = await read("docker/development/Dockerfile");
  const productionDockerfile = await read("Dockerfile");

  assert.match(developmentDockerfile, /chown\s+node:node\s+\/app/);
  assert.match(developmentDockerfile, /USER\s+node/);
  assert.match(productionDockerfile, /USER\s+nextjs/);
});

test("環境変数テンプレートには秘密値を置かない", async () => {
  const environmentExample = await read(".env.example");

  assert.match(environmentExample, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(environmentExample, /NEXT_PUBLIC_SUPABASE_ANON_KEY=/);
  assert.doesNotMatch(environmentExample, /SERVICE_ROLE/);
  assert.doesNotMatch(environmentExample, /eyJ[A-Za-z0-9_-]+\./);
});

test("全ページへ基本セキュリティヘッダーを設定する", async () => {
  const nextConfig = await read("next.config.ts");

  for (const header of [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]) {
    assert.match(nextConfig, new RegExp(header));
  }
});

test("要件IDと受け入れ条件IDは重複しない", async () => {
  const requirements = [
    await read("specs/01-product-requirements.md"),
    await read("specs/06-non-functional-requirements.md"),
  ].join("\n");
  const useCases = await read("specs/02-use-cases.md");
  const requirementIds = [
    ...requirements.matchAll(
      /^- `([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)?-[0-9]{3})`/gm,
    ),
  ].map((match) => match[1]);
  const acceptanceConditionIds = [
    ...useCases.matchAll(/^- `(AC-[A-Z]+-[0-9]{3}-[0-9]+)`/gm),
  ].map((match) => match[1]);
  assert.equal(new Set(requirementIds).size, requirementIds.length);
  assert.equal(
    new Set(acceptanceConditionIds).size,
    acceptanceConditionIds.length,
  );
});

test("スマートフォン主用途と未解決不具合のIssue運用を明記する", async () => {
  const agentRules = await read("AGENTS.md");
  const screenSpecification = await read("specs/03-screen-specification.md");

  assert.match(agentRules, /主にスマートフォンから利用/);
  assert.match(agentRules, /モバイルファースト/);
  assert.match(
    agentRules,
    /その場で安全かつ確実に解決できない場合.*Issueを作成/,
  );
  assert.match(screenSpecification, /主にスマートフォンから利用/);
  assert.match(screenSpecification, /モバイルファースト/);
});

test("PC表示を複数カラムへ適応し未定義tokenを使わない", async () => {
  const styles = await read("src/app/styles.css");
  const agentRules = await read("AGENTS.md");

  assert.match(agentRules, /1280 x 800 CSS pixel/);
  assert.match(styles, /@media \(min-width: 900px\)/);
  assert.match(styles, /\.groups-overview\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.shell\s*\{[^}]*grid-template-columns:/s);
  assert.doesNotMatch(styles, /var\(--(?:line|ink)\)/);
});

test("GitHub Actionsで最小権限の品質・統合CIを実行する", async () => {
  assert.equal(await exists(".github/workflows/ci.yml"), true);

  const workflow = await read(".github/workflows/ci.yml");
  const environmentSetup = await read("scripts/setup-local-env.sh");
  const actionReferences = [
    ...workflow.matchAll(/uses:\s+[^\s@]+@([^\s]+)/g),
  ].map((match) => match[1]);

  assert.match(workflow, /on:\s*\n\s+push:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /push:\s*[\s\S]{0,120}branches:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.doesNotMatch(workflow, /contents:\s+write|\$\{\{\s*secrets\./);
  assert.ok(actionReferences.length >= 2);
  assert.ok(
    actionReferences.every((reference) => /^[0-9a-f]{40}$/.test(reference)),
  );
  assert.match(workflow, /persist-credentials:\s+false/);
  assert.match(workflow, /node-version:\s+24/);
  assert.match(workflow, /cache:\s+npm/);

  for (const command of [
    "npm ci",
    "npm run format:check",
    "npm run lint",
    "npm run typecheck",
    "npm run test:architecture",
    "npm run test:coverage",
    "npm run build",
    "docker compose --profile test run --rm integration-tests",
    "docker compose --profile test run --rm web-integration-tests",
    "docker build --tag account-book:ci .",
  ]) {
    assert.match(workflow, new RegExp(command.replaceAll(" ", "\\s+")));
  }

  assert.match(workflow, /docker compose down --volumes --remove-orphans/);
  assert.match(workflow, /if:\s+always\(\)/);
  assert.match(environmentSetup, /LOCAL_GOOGLE_OAUTH_ENABLED/);
  assert.match(environmentSetup, /LOCAL_ALLOWED_GOOGLE_EMAILS/);
});

test("スタイルを所有権で分離する (NFR-MNT-010)", async () => {
  const globalCss = await read("src/app/styles.css");

  // 単一機能のpresentationだけが使う機能固有セレクタをglobalへ残さない。
  const featureSelectors = [
    "calendar-grid",
    "calendar-day-panel",
    "expense-form",
    "segmented-control",
    "category-option",
    "group-navigation-link",
    "invitation-panel",
    "member-list",
    "history-row",
    "history-filter-form",
    "category-manager",
    "category-row",
    "logout-form",
    "profile-form",
  ];
  for (const cls of featureSelectors) {
    assert.doesNotMatch(
      globalCss,
      new RegExp(`\\.${cls}(?![a-zA-Z0-9_-])`),
      `.${cls}はglobalではなく機能のCSS Modulesに置く必要があります`,
    );
  }

  // 旧メール認証の未使用セレクタを残さない。
  for (const cls of ["auth-form", "auth-links", "auth-separator"]) {
    assert.doesNotMatch(globalCss, new RegExp(`\\.${cls}(?![a-zA-Z0-9_-])`));
  }

  // 機能単位のCSS Modulesがpresentationに併置され、コンポーネントから参照される。
  const featureModules = [
    [
      "src/modules/auth/presentation/auth.module.css",
      "src/modules/auth/presentation/auth-forms.tsx",
    ],
    [
      "src/modules/calendar/presentation/calendar.module.css",
      "src/modules/calendar/presentation/calendar-home.tsx",
    ],
    [
      "src/modules/categories/presentation/categories.module.css",
      "src/modules/categories/presentation/category-management.tsx",
    ],
    [
      "src/modules/groups/presentation/groups.module.css",
      "src/modules/groups/presentation/group-navigation.tsx",
    ],
    [
      "src/modules/history/presentation/history.module.css",
      "src/modules/history/presentation/history-view.tsx",
    ],
    [
      "src/modules/transactions/presentation/transactions.module.css",
      "src/modules/transactions/presentation/expense-form.tsx",
    ],
  ];
  for (const [cssPath, tsxPath] of featureModules) {
    const moduleCss = await read(cssPath);
    assert.ok(moduleCss.length > 0, `${cssPath}が必要です`);
    const tsx = await read(tsxPath);
    assert.match(tsx, /import styles from ".\/[a-z]+\.module\.css"/);
  }
});
