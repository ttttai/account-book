import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// AC-INF-001-19: docsのみ判定の対象を安全なファイルに限定する
test("docsのみ判定scriptはtestが参照しないドキュメントだけを対象にする", async () => {
  const script = await read("scripts/docs-only-diff.sh");

  assert.match(script, /^#!\/bin\/sh/);
  assert.match(script, /set -eu/);

  // ドキュメント扱いするのはdocs配下、root README.md、CLAUDE.mdだけである
  assert.match(script, /docs\/\*\)/);
  assert.match(script, /README\.md\)/);
  assert.match(script, /CLAUDE\.md\)/);

  // architecture testが内容を検証するfileをドキュメント扱いのcase分岐に含めない
  assert.doesNotMatch(script, /specs\/\*\)/);
  assert.doesNotMatch(script, /AGENTS\.md\)/);

  // 判定不能時は安全側(アプリに影響あり扱い)へ倒す
  assert.match(script, /\|\| exit 1/);
});

// AC-INF-001-19: CIはdocsのみのpushで重い検証だけをskipし、formatは常に実行する
test("CIはdocsのみのpushで重い検証ジョブだけをskipする", async () => {
  const workflow = await read(".github/workflows/ci.yml");

  // 判定は共有scriptへ集約する
  assert.match(workflow, /scripts\/docs-only-diff\.sh/);

  // 作業ブランチはmainとの分岐点から、mainは直前commitから判定する
  assert.match(workflow, /merge-base origin\/main/);
  assert.match(workflow, /github\.event\.before/);

  // 重い検証(Quality、E2E、Docker integration)の3つだけがdocsのみでskipされる
  const skipConditions = workflow.match(
    /needs\.changes\.outputs\.docs_only != 'true'/g,
  );
  assert.equal(skipConditions?.length, 3);

  // format checkはmarkdown自体の検証のため、条件なしの独立jobとして常に実行する
  const formatChecks = workflow.match(/npm run format:check/g);
  assert.equal(formatChecks?.length, 1);
  const formatJob = workflow.slice(
    workflow.indexOf("format:"),
    workflow.indexOf("quality:"),
  );
  assert.match(formatJob, /npm run format:check/);
  assert.doesNotMatch(formatJob, /docs_only/);
});

// AC-INF-001-20: CDは実際にdeployした直近commitとの差分がdocsのみのときだけskipする
test("production CDは前回deploy以降がdocsのみの場合だけdeployをskipする", async () => {
  const workflow = await read(".github/workflows/deploy-production.yml");

  // 判定jobは過去のdeploy実績の照会だけを行い、GCPの資格情報を持たない
  assert.match(workflow, /actions:\s*read/);
  assert.doesNotMatch(
    workflow.slice(0, workflow.indexOf("deploy:")),
    /google-github-actions/,
  );

  // 基準は「Build and deploy jobが実際に成功したrun」であり、skipしたrunを含めない
  assert.match(
    workflow,
    /select\(\.name == "Build and deploy" and \.conclusion == "success"\)/,
  );

  // 差分判定は共有scriptを使う
  assert.match(workflow, /scripts\/docs-only-diff\.sh/);

  // deploy jobは判定結果がtrueのときだけ実行される
  assert.match(workflow, /needs\.changes\.outputs\.deploy == 'true'/);

  // 手動実行と判定不能時は必ずdeployする(fail open)
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /deploy=true/);
});
