import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = process.cwd();

const diagramEntityByTable = {
  "app_private.allowed_google_accounts": "ALLOWED_GOOGLE_ACCOUNTS",
  "public.categories": "CATEGORIES",
  "public.group_invitations": "GROUP_INVITATIONS",
  "public.group_members": "GROUP_MEMBERS",
  "public.groups": "GROUPS",
  "public.profiles": "PROFILES",
  "public.transaction_allocations": "TRANSACTION_ALLOCATIONS",
  "public.transactions": "TRANSACTIONS",
};

async function read(path) {
  return readFile(new URL(path, `file://${repositoryRoot}/`), "utf8");
}

test("ER図を実装済みmigrationとグループ境界へ同期する", async () => {
  const migrationDirectory = new URL(
    "supabase/migrations/",
    `file://${repositoryRoot}/`,
  );
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const migrations = (
    await Promise.all(
      migrationFiles.map((fileName) => read(`supabase/migrations/${fileName}`)),
    )
  ).join("\n");
  const diagram = await read("specs/10-er-diagram.md");

  const implementedTables = [
    ...migrations.matchAll(
      /create table\s+(?:if not exists\s+)?(public|app_private)\.([a-z_]+)/gi,
    ),
  ]
    .map((match) => `${match[1].toLowerCase()}.${match[2].toLowerCase()}`)
    .sort();

  assert.deepEqual(implementedTables, Object.keys(diagramEntityByTable).sort());

  for (const [table, entity] of Object.entries(diagramEntityByTable)) {
    assert.match(diagram, new RegExp(`\\n\\s{4}${entity} \\{`), table);
  }

  assert.match(diagram, /AUTH_USERS \|\|--\|\| PROFILES/);
  assert.match(diagram, /GROUPS \|\|--o\{ GROUP_MEMBERS/);
  assert.match(diagram, /GROUPS \|\|--o\{ TRANSACTIONS/);
  assert.match(diagram, /CATEGORIES \|\|--o\{ TRANSACTIONS/);
  assert.match(diagram, /TRANSACTIONS \|\|--o\{ TRANSACTION_ALLOCATIONS/);
  assert.match(diagram, /GROUP_MEMBERS \|\|--o\{ TRANSACTION_ALLOCATIONS/);
  assert.match(diagram, /複合外部キーで同じグループへ固定/);
  assert.doesNotMatch(diagram, /\n\s{4}DAILY_SUMMARIES\s+\{/);
  assert.match(diagram, /`daily_summaries`テーブルは作成しない/);
});
