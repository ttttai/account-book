import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const applyScript = fileURLToPath(new URL("scripts/apply-migrations.sh", root));

// risk宣言を必須にする前の最後のmigration。これ以前は適用済みで書き換えない(INF-025)
const LAST_UNDECLARED_MIGRATION = "202610150001_asset_tracking";

function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// workflowから`  <job id>:`で始まるjob定義の範囲だけを切り出す
function jobBlock(workflow, jobId) {
  const start = workflow.indexOf(`\n  ${jobId}:\n`);
  assert.notEqual(start, -1, `${jobId} jobが見つかりません`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

// コメント、関数本体のdollar quote、文字列literalを除いた、実行される文だけを返す。doブロックの中身は実行されるため残す
function executableSql(sql) {
  let output = "";
  let index = 0;
  let doBlockTag = "";
  while (index < sql.length) {
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? sql.length : end;
      continue;
    }
    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      index = end === -1 ? sql.length : end + 2;
      output += " ";
      continue;
    }
    const dollarTag = /^\$[A-Za-z_]*\$/.exec(sql.slice(index));
    if (dollarTag && dollarTag[0] === doBlockTag) {
      doBlockTag = "";
      index += dollarTag[0].length;
      output += " ";
      continue;
    }
    if (
      dollarTag &&
      !doBlockTag &&
      /\bdo(\s+language\s+\w+)?\s*$/i.test(output)
    ) {
      doBlockTag = dollarTag[0];
      index += dollarTag[0].length;
      output += " ";
      continue;
    }
    if (dollarTag) {
      const end = sql.indexOf(dollarTag[0], index + dollarTag[0].length);
      index = end === -1 ? sql.length : end + dollarTag[0].length;
      output += " $$ ";
      continue;
    }
    if (sql[index] === "'") {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === "'" && sql[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        if (sql[cursor] === "'") break;
        cursor += 1;
      }
      index = cursor + 1;
      output += " '' ";
      continue;
    }
    output += sql[index];
    index += 1;
  }
  return output;
}

// データや既存構造を壊しうる文。事前dumpが必要なhigh宣言の根拠になる(NFR-REC-003)
const DESTRUCTIVE_STATEMENTS = [
  /\bdrop\s+(table|schema|column|type)\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\bupdate\s+[\w."]+(\s+(as\s+)?\w+)?\s+set\b/i,
  /\brename\s+(to|column|constraint)\b/i,
  /\bset\s+not\s+null\b/i,
  /\balter\s+column\s+[\w"]+\s+(set\s+data\s+)?type\b/i,
  /\badd\s+constraint\b/i,
  /\badd\s+(check|unique|primary\s+key|foreign\s+key)\b/i,
];

function destructiveStatements(sql) {
  const executable = executableSql(sql);
  return DESTRUCTIVE_STATEMENTS.filter((pattern) =>
    pattern.test(executable),
  ).map((pattern) => executable.match(pattern)[0]);
}

function riskDeclarations(sql) {
  return [...sql.matchAll(/^--\s*migration-risk:\s*(\S+)\s*$/gim)].map(
    (match) => match[1].toLowerCase(),
  );
}

// AC-INF-001-28: 適用jobはdeployより前に、自動適用を有効にした場合だけ実行する
test("production CDはmigrationを適用してからdeployする", async () => {
  const workflow = await read(".github/workflows/deploy-production.yml");
  const migrate = jobBlock(workflow, "migrate");
  const deploy = jobBlock(workflow, "deploy");

  assert.match(migrate, /name: Apply migrations/);
  assert.match(migrate, /needs: changes/);
  assert.match(migrate, /needs\.changes\.outputs\.deploy == 'true'/);
  assert.match(migrate, /vars\.PRODUCTION_MIGRATIONS_ENABLED == 'true'/);
  assert.match(migrate, /environment: production/);

  assert.match(deploy, /name: Build and deploy/);
  assert.match(deploy, /needs: \[changes, migrate\]/);
  // 失敗・cancelでは止め、自動適用が無効(skipped)なら従来どおりdeployする
  assert.match(deploy, /!cancelled\(\)/);
  assert.match(deploy, /needs\.migrate\.result == 'success'/);
  assert.match(deploy, /needs\.migrate\.result == 'skipped'/);
  assert.doesNotMatch(deploy, /always\(\)/);
});

// AC-INF-001-29: DB接続文字列は適用jobだけが変数名で受け渡し、GCP資格情報と同居させない
test("本番DB接続文字列は適用jobの中だけで参照する", async () => {
  const workflow = await read(".github/workflows/deploy-production.yml");
  const migrate = jobBlock(workflow, "migrate");

  const references = workflow.match(/secrets\.PRODUCTION_DATABASE_URL/g) ?? [];
  assert.equal(references.length, 1);
  assert.match(migrate, /secrets\.PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(jobBlock(workflow, "changes"), /DATABASE_URL/);
  assert.doesNotMatch(jobBlock(workflow, "deploy"), /DATABASE_URL/);

  // 値をdocker runのcommand lineへ展開せず、変数名だけで渡す
  assert.match(migrate, /--env DATABASE_URL \\/);
  assert.doesNotMatch(
    migrate,
    /\$\{\{\s*env\.DATABASE_URL|--env DATABASE_URL=/,
  );
  assert.doesNotMatch(migrate, /\$\{DATABASE_URL\}|\$DATABASE_URL\b/);
  assert.match(migrate, /--env MIGRATION_MODE=production/);
  // secret未設定では何も適用せず失敗する
  assert.match(migrate, /-z "\$\{DATABASE_URL:-\}"/);

  // 適用jobはGCPのOIDC tokenを発行できない
  assert.doesNotMatch(migrate, /id-token/);
  assert.doesNotMatch(migrate, /google-github-actions/);

  // imageはdigestで固定し、scriptとmigrationは読み取り専用でmountする
  assert.match(migrate, /postgres:17\.6@sha256:[0-9a-f]{64}/);
  assert.match(migrate, /supabase\/migrations:\/migrations:ro/);
  assert.match(
    migrate,
    /scripts\/apply-migrations\.sh:\/app\/apply-migrations\.sh:ro/,
  );

  for (const forbidden of [
    "AUTH_ALLOWED_GOOGLE_EMAILS",
    "sync_allowed_google_accounts",
    "sync-local-allowed-google-accounts",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assert.doesNotMatch(workflow, new RegExp(forbidden));
  }
});

// AC-INF-001-30: 適用scriptは許可リストを同期せず、ローカルだけが成功後に同期する
test("許可リスト同期は適用scriptから分離されている", async () => {
  const apply = await read("scripts/apply-migrations.sh");
  const sync = await read("scripts/sync-local-allowed-google-accounts.sh");
  const compose = await read("compose.yaml");

  assert.doesNotMatch(apply, /AUTH_ALLOWED_GOOGLE_EMAILS|allowed_google/);
  assert.match(sync, /^#!\/bin\/sh/);
  assert.match(sync, /set -eu/);
  assert.match(sync, /AUTH_ALLOWED_GOOGLE_EMAILS/);
  assert.match(sync, /app_private\.sync_allowed_google_accounts/);
  assert.doesNotMatch(sync, /schema_migrations|migration/);

  assert.match(
    compose,
    /\.\/scripts\/sync-local-allowed-google-accounts\.sh:\/app\/sync-local-allowed-google-accounts\.sh:ro/,
  );
  // `&&`で連結し、migrationが失敗したら同期しない
  assert.match(
    compose,
    /\/bin\/sh \/app\/apply-migrations\.sh && \/bin\/sh \/app\/sync-local-allowed-google-accounts\.sh/,
  );
});

// AC-INF-001-31: risk宣言の判定が既存ファイルで期待どおりに働く
test("破壊的な文の判定は関数本体を除きdoブロックを含め、既存の制約追加だけを検出する", async () => {
  const directory = new URL("supabase/migrations/", root);
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith(".sql"),
  );
  const detected = [];
  for (const file of files.filter(
    (name) => name <= `${LAST_UNDECLARED_MIGRATION}.sql`,
  )) {
    if (
      destructiveStatements(await readFile(new URL(file, directory), "utf8"))
        .length > 0
    ) {
      detected.push(file.replace(/\.sql$/, ""));
    }
  }
  assert.deepEqual(detected.sort(), [
    "202608270001_expense_transactions",
    "202609060001_category_color_palette",
  ]);

  // 関数本体、コメント、文字列の中は実行されないため対象外
  assert.deepEqual(
    destructiveStatements(
      "-- drop table x\ncreate function f() returns void language plpgsql as $$\nbegin\n  update public.t set a = 1;\n  delete from public.t;\nend;\n$$;\nselect 'truncate';",
    ),
    [],
  );
  // doブロックはその場で実行されるため、中身も判定の対象にする
  for (const statement of [
    "do $$\nbegin\n  delete from public.t;\nend;\n$$;",
    "do $body$ begin update public.t set a = 1; end $body$;",
    "do language plpgsql $$ begin truncate public.t; end $$;",
    "DO\n$$\nbegin\n  execute 'select 1';\n  drop table public.t;\nend;\n$$;",
  ]) {
    assert.notDeepEqual(destructiveStatements(statement), [], statement);
  }
  // doブロックの後の関数本体は引き続き対象外とする
  assert.deepEqual(
    destructiveStatements(
      "do $$ begin perform 1; end $$;\ncreate function g() returns void language sql as $$ delete from public.t $$;",
    ),
    [],
  );

  for (const statement of [
    "drop table public.t;",
    "alter table public.t drop column a;",
    "truncate public.t;",
    "delete from public.t where true;",
    "update public.t set a = 1;",
    "update public.t as t set a = 1;",
    "alter table public.t rename column a to b;",
    "alter table public.t rename to u;",
    "alter table public.t alter column a set not null;",
    "alter table public.t alter column a type bigint;",
    "alter table public.t add constraint c check (a > 0);",
  ]) {
    assert.notDeepEqual(destructiveStatements(statement), [], statement);
  }
  assert.deepEqual(
    destructiveStatements(
      "create table public.t (a int constraint c check (a > 0));\nalter table public.t add column b int not null default 1;\ndrop function if exists f();",
    ),
    [],
  );
});

// AC-INF-001-31: 新しいmigrationはriskを1行だけ宣言し、破壊的ならhighとする
test("宣言対象のmigrationはriskを正しく宣言している", async () => {
  const directory = new URL("supabase/migrations/", root);
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => file > `${LAST_UNDECLARED_MIGRATION}.sql`);

  for (const file of files) {
    const sql = await readFile(new URL(file, directory), "utf8");
    const declarations = riskDeclarations(sql);
    assert.equal(
      declarations.length,
      1,
      `${file}: -- migration-risk: low|high を1行だけ書いてください`,
    );
    assert.ok(["low", "high"].includes(declarations[0]), file);
    const destructive = destructiveStatements(sql);
    if (destructive.length > 0) {
      assert.equal(
        declarations[0],
        "high",
        `${file}: ${destructive.join(", ")} を含むためhighを宣言してください`,
      );
    }
  }
});

// psqlのstub。台帳はstate fileで表し、呼び出し引数をlogへ1行ずつ残す
const STUB_PSQL = `#!/bin/sh
set -eu
file=""
version=""
list=""
for argument in "$@"; do
  case "$argument" in
    --file=*) file="\${argument#--file=}" ;;
    --command=select\\ version*) list=1 ;;
    --command=insert*) version=$(printf '%s' "$argument" | sed -n "s/.*values ('\\(.*\\)').*/\\1/p") ;;
  esac
done
printf '%s\\n' "$*" >> "$STUB_LOG"
if [ -n "$list" ]; then
  cat "$STUB_STATE"
  exit 0
fi
if [ -n "$file" ]; then
  if [ "$version" = "\${STUB_FAIL_VERSION:-}" ]; then
    exit 3
  fi
  printf '%s\\n' "$version" >> "$STUB_STATE"
  exit 0
fi
cat > /dev/null
`;

async function runApply({
  mode,
  applied = [],
  files,
  failVersion,
  databaseUrl,
}) {
  const workspace = await mkdtemp(join(tmpdir(), "apply-migrations-"));
  try {
    const bin = join(workspace, "bin");
    const migrations = join(workspace, "migrations");
    await Promise.all([mkdir(bin), mkdir(migrations)]);
    await writeFile(join(bin, "psql"), STUB_PSQL);
    await chmod(join(bin, "psql"), 0o755);
    const state = join(workspace, "state");
    const log = join(workspace, "log");
    await writeFile(state, applied.map((version) => `${version}\n`).join(""));
    await writeFile(log, "");
    for (const [name, sql] of Object.entries(files)) {
      await writeFile(join(migrations, `${name}.sql`), sql);
    }

    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      MIGRATIONS_DIR: migrations,
      STUB_STATE: state,
      STUB_LOG: log,
    };
    if (mode) env.MIGRATION_MODE = mode;
    if (failVersion) env.STUB_FAIL_VERSION = failVersion;
    if (databaseUrl) env.DATABASE_URL = databaseUrl;

    const result = spawnSync("/bin/sh", [applyScript], {
      env,
      encoding: "utf8",
      input: "",
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      calls: (await readFile(log, "utf8")).split("\n").filter(Boolean),
      state: (await readFile(state, "utf8")).split("\n").filter(Boolean),
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

const LOW = "-- migration-risk: low\ncreate table public.a (id int);\n";
const HIGH = "-- migration-risk: high\nalter table public.a drop column id;\n";

// AC-INF-001-32: 未適用のhighがあれば1件も適用せずに失敗する
test("production modeは未適用のhigh宣言があると何も適用しない", async () => {
  const result = await runApply({
    mode: "production",
    applied: ["001_base"],
    files: { "001_base": LOW, "002_add": LOW, "003_drop": HIGH },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /003_drop/);
  assert.equal(
    result.calls.filter((call) => call.includes("--file=")).length,
    0,
  );
  assert.deepEqual(result.state, ["001_base"]);
});

// AC-INF-001-32: 台帳が空のDBへ全ファイルを再実行しない
test("production modeは台帳が空なら何も適用しない", async () => {
  const result = await runApply({
    mode: "production",
    files: { "001_base": LOW },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /schema_migrations/);
  assert.equal(
    result.calls.filter((call) => call.includes("--file=")).length,
    0,
  );
});

// AC-INF-001-32: 未適用をファイル名順にlock_timeout付きで適用し、残りが無いことを確かめる
test("production modeは未適用をlock_timeout付きで順に適用する", async () => {
  const result = await runApply({
    mode: "production",
    applied: ["001_base"],
    files: { "003_more": LOW, "001_base": LOW, "002_add": LOW },
    databaseUrl: "postgresql://stub",
  });

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.state, ["001_base", "002_add", "003_more"]);
  const applies = result.calls.filter((call) => call.includes("--file="));
  assert.equal(applies.length, 2);
  for (const call of applies) {
    assert.match(call, /--single-transaction/);
    assert.match(
      call,
      /--command=set local lock_timeout = '10s' --file=\S+ --command=insert/,
    );
  }
  assert.match(applies[0], /002_add\.sql/);
  assert.match(applies[1], /003_more\.sql/);
  // 接続文字列はpsqlへ渡すだけで出力しない
  assert.ok(
    result.calls.every((call) => call.includes("--dbname=postgresql://stub")),
  );
  assert.doesNotMatch(result.output, /postgresql:\/\/stub/);
  // 適用後に台帳を読み直して未適用が残らないことを確認する
  const listings = result.calls.filter((call) =>
    call.includes("select version"),
  );
  assert.equal(listings.length, 2);
});

// AC-INF-001-32: 途中のファイルが失敗したら以降を適用しない
test("適用に失敗したファイル以降は適用しない", async () => {
  const result = await runApply({
    mode: "production",
    applied: ["001_base"],
    files: { "001_base": LOW, "002_add": LOW, "003_more": LOW },
    failVersion: "002_add",
  });

  assert.notEqual(result.status, 0);
  assert.deepEqual(result.state, ["001_base"]);
  assert.equal(
    result.calls.some((call) => call.includes("003_more")),
    false,
  );
});

// AC-INF-001-32: ローカルは空のvolumeから高riskも含めて適用する
test("local modeは台帳が空でもhigh宣言も含めて適用する", async () => {
  const result = await runApply({
    files: { "001_base": LOW, "002_drop": HIGH },
  });

  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.state, ["001_base", "002_drop"]);
  assert.ok(result.calls.every((call) => !call.includes("lock_timeout")));
  assert.ok(result.calls.every((call) => !call.includes("--dbname=")));
});

test("不正なMIGRATION_MODEとファイル名を拒否する", async () => {
  const invalidMode = await runApply({
    mode: "prod",
    files: { "001_base": LOW },
  });
  assert.notEqual(invalidMode.status, 0);
  assert.equal(invalidMode.calls.length, 0);

  const invalidName = await runApply({ files: { "001 base": LOW } });
  assert.notEqual(invalidName.status, 0);
  assert.equal(
    invalidName.calls.filter((call) => call.includes("--file=")).length,
    0,
  );
});

// AC-INF-001-33: 運用資料が自動適用の有効化・高risk・失敗時の手順を説明する
test("運用資料が本番migrationの自動適用を説明する", async () => {
  const databaseChanges = await read("docs/operations/database-changes.md");
  const deployment = await read("docs/operations/deployment.md");

  for (const phrase of [
    "PRODUCTION_MIGRATIONS_ENABLED",
    "PRODUCTION_DATABASE_URL",
    "Session pooler",
    "-- migration-risk: low",
    "-- migration-risk: high",
    "workflow_dispatch",
    "Apply migrations",
    "pg_dump",
    "sync-local-allowed-google-accounts.sh",
  ]) {
    assert.ok(
      databaseChanges.includes(phrase),
      `database-changes.md: ${phrase}`,
    );
  }
  for (const phrase of ["Apply migrations", "PRODUCTION_MIGRATIONS_ENABLED"]) {
    assert.ok(deployment.includes(phrase), `deployment.md: ${phrase}`);
  }
});
