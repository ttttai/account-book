import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("NFR-E2E-001: E2Eの仕様・要件・npm scriptが揃っている", async () => {
  const requirements = await read("specs/06-non-functional-requirements.md");
  const specification = await read("specs/15-e2e-testing.md");
  const packageManifest = JSON.parse(await read("package.json"));

  for (let index = 1; index <= 5; index += 1) {
    assert.match(
      requirements,
      new RegExp(`NFR-E2E-00${index}`),
      `NFR-E2E-00${index}の宣言が必要です`,
    );
  }
  assert.match(specification, /状態: 承認済み/);
  assert.equal(
    packageManifest.scripts["test:e2e"],
    "sh scripts/e2e-stack.sh up && sh scripts/e2e-stack.sh seed && playwright test",
  );
  assert.equal(
    packageManifest.scripts["test:e2e:down"],
    "sh scripts/e2e-stack.sh down",
  );
});

test("NFR-E2E-001: CIがE2Eを独立jobとして実行し、artifactと後片付けを行う", async () => {
  const workflow = await read(".github/workflows/ci.yml");

  assert.match(workflow, /e2e:\n\s+name: E2E/);
  assert.match(workflow, /npm run test:e2e/);
  assert.match(workflow, /npm run test:e2e:down/);
  assert.match(workflow, /upload-artifact/);
  // 既存の品質jobとDocker統合jobを置き換えず、判別可能なまま並列実行する
  assert.match(workflow, /name: Quality/);
  assert.match(workflow, /name: Docker integration/);
});

test("NFR-E2E-002: E2Eはloopback限定で、使い捨てstackだけを対象にする", async () => {
  const environment = await read("tests/e2e/support/e2e-environment.ts");
  const stackScript = await read("scripts/e2e-stack.sh");
  const playwrightConfig = await read("playwright.config.ts");

  assert.match(environment, /LOOPBACK_HOSTNAMES/);
  assert.match(environment, /実行を中止/);
  assert.match(playwrightConfig, /getE2eEnvironment\(\)/);
  assert.match(stackScript, /E2E_COMPOSE_PROJECT:-account-book-e2e/);
  assert.match(stackScript, /--env-file/);
  // 開発用volumeを消さないため、down対象はE2E専用projectだけとする
  assert.match(stackScript, /compose down --volumes --remove-orphans/);
  assert.doesNotMatch(stackScript, /docker compose down --volumes\s*$/);
});

test("NFR-E2E-003: production codeへtest専用の分岐を持ち込まない", async () => {
  const sourceFiles = [];
  async function collect(directory) {
    for (const entry of await readdir(new URL(directory, root), {
      withFileTypes: true,
    })) {
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) await collect(`${path}/`);
      else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(path);
    }
  }
  await collect("src/");

  for (const path of sourceFiles) {
    const contents = await read(path);
    assert.doesNotMatch(
      contents,
      /E2E_|PLAYWRIGHT|__e2e/i,
      `${path}にE2E専用の分岐が含まれています`,
    );
  }
});

test("NFR-E2E-004: 375pxを主要projectとし1280pxと320pxも検証する", async () => {
  const playwrightConfig = await read("playwright.config.ts");
  const responsiveSpec = await read("tests/e2e/responsive.spec.ts");

  assert.match(playwrightConfig, /name: "mobile"/);
  assert.match(playwrightConfig, /width: 375, height: 812/);
  assert.match(playwrightConfig, /name: "desktop"/);
  assert.match(playwrightConfig, /width: 1280, height: 800/);
  assert.match(responsiveSpec, /MINIMUM_WIDTH = 320/);
});

test("NFR-E2E-005: 失敗時のtrace・screenshot・videoを保存する", async () => {
  const playwrightConfig = await read("playwright.config.ts");

  assert.match(playwrightConfig, /trace: "retain-on-failure"/);
  assert.match(playwrightConfig, /screenshot: "only-on-failure"/);
  assert.match(playwrightConfig, /video: "retain-on-failure"/);
});

test("E2Eユーザーの定義をseed SQL・stack script・testで一致させる", async () => {
  const users = await read("tests/e2e/support/e2e-users.ts");
  const seed = await read("tests/e2e/seed/seed-e2e-users.sql");
  const stackScript = await read("scripts/e2e-stack.sh");

  for (const email of ["e2e-a@example.test", "e2e-b@example.test"]) {
    assert.match(users, new RegExp(email));
    assert.match(seed, new RegExp(email));
    assert.match(stackScript, new RegExp(email));
  }
  for (const userId of [
    "e2e00000-0000-4000-8000-00000000000a",
    "e2e00000-0000-4000-8000-00000000000b",
  ]) {
    assert.match(users, new RegExp(userId));
    assert.match(seed, new RegExp(userId));
  }
  // 許可リストの実アドレスをテスト資産へ書かない
  assert.doesNotMatch(seed, /@gmail\.com/);
  assert.doesNotMatch(stackScript, /@gmail\.com/);
});

test("E2Eシナリオが仕様のIDと対応している", async () => {
  const specification = await read("specs/15-e2e-testing.md");
  const specFiles = (await readdir(new URL("tests/e2e/", root))).filter(
    (name) => name.endsWith(".spec.ts"),
  );
  const contents = await Promise.all(
    specFiles.map((name) => read(`tests/e2e/${name}`)),
  );
  const joined = contents.join("\n");

  assert.ok(specFiles.length >= 5, "E2E specファイルが不足しています");
  for (let index = 1; index <= 8; index += 1) {
    const scenarioId = `E2E-00${index}`;
    assert.match(specification, new RegExp(scenarioId));
    assert.match(
      joined,
      new RegExp(scenarioId),
      `${scenarioId}のtestが必要です`,
    );
  }
});
