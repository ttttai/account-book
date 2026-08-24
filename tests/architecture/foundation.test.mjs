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
