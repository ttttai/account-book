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
  for (const script of ["format:check", "lint", "typecheck", "test", "build"]) {
    assert.equal(
      typeof packageJson.scripts[script],
      "string",
      `${script}が必要です`,
    );
  }
});

test("Docker Composeを標準のローカル開発入口にする", async () => {
  const compose = await read("compose.yaml");

  assert.match(compose, /develop:\s*\n\s+watch:/);
  assert.match(compose, /action:\s*sync/);
  assert.match(compose, /action:\s*rebuild/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
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

test("仕様レビューの要件件数と宣言を一致させる", async () => {
  const requirements = [
    await read("specs/01-product-requirements.md"),
    await read("specs/06-non-functional-requirements.md"),
  ].join("\n");
  const useCases = await read("specs/02-use-cases.md");
  const review = await read("specs/09-spec-review.md");
  const requirementIds = [
    ...requirements.matchAll(/^- `([A-Z]+(?:-[A-Z]+)?-[0-9]{3})`/gm),
  ].map((match) => match[1]);
  const acceptanceConditionIds = [
    ...useCases.matchAll(/^- `(AC-[A-Z]+-[0-9]{3}-[0-9]+)`/gm),
  ].map((match) => match[1]);
  const recordedCounts = review.match(
    /要件ID ([0-9]+)件、明示的な受け入れ条件ID ([0-9]+)件/,
  );

  assert.ok(recordedCounts, "仕様レビューにID件数の記録が必要です");
  assert.equal(new Set(requirementIds).size, requirementIds.length);
  assert.equal(
    new Set(acceptanceConditionIds).size,
    acceptanceConditionIds.length,
  );
  assert.equal(Number(recordedCounts[1]), requirementIds.length);
  assert.equal(Number(recordedCounts[2]), acceptanceConditionIds.length);
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
