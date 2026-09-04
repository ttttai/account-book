import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = process.cwd();

const diagramEntityByTable = {
  "app_private.allowed_google_accounts": "ALLOWED_GOOGLE_ACCOUNTS",
  "public.budget_category_limits": "BUDGET_CATEGORY_LIMITS",
  "public.budget_revisions": "BUDGET_REVISIONS",
  "public.categories": "CATEGORIES",
  "public.group_invitations": "GROUP_INVITATIONS",
  "public.group_members": "GROUP_MEMBERS",
  "public.groups": "GROUPS",
  "public.profiles": "PROFILES",
  "public.recurring_transaction_allocations":
    "RECURRING_TRANSACTION_ALLOCATIONS",
  "public.recurring_transactions": "RECURRING_TRANSACTIONS",
  "public.transaction_allocations": "TRANSACTION_ALLOCATIONS",
  "public.transactions": "TRANSACTIONS",
  "public.user_preferences": "USER_PREFERENCES",
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
  // 起動時に開くグループは本人だけの設定で、所属の正本にしない (GRP-012)
  assert.match(diagram, /AUTH_USERS \|\|--o\| USER_PREFERENCES/);
  assert.match(diagram, /GROUPS \|o--o\{ USER_PREFERENCES/);
  assert.match(diagram, /GROUPS \|\|--o\{ GROUP_MEMBERS/);
  assert.match(diagram, /GROUPS \|\|--o\{ TRANSACTIONS/);
  assert.match(diagram, /CATEGORIES \|\|--o\{ TRANSACTIONS/);
  assert.match(diagram, /TRANSACTIONS \|\|--o\{ TRANSACTION_ALLOCATIONS/);
  assert.match(diagram, /GROUP_MEMBERS \|\|--o\{ TRANSACTION_ALLOCATIONS/);
  assert.match(diagram, /複合外部キーで同じグループへ固定/);
  assert.doesNotMatch(diagram, /\n\s{4}DAILY_SUMMARIES\s+\{/);
  assert.match(diagram, /`daily_summaries`テーブルは作成しない/);
  assert.match(
    diagram,
    /RECURRING_TRANSACTIONS \|\|--o\{ RECURRING_TRANSACTION_ALLOCATIONS/,
  );
  // 展開結果（occurrence）はテーブル化しない (REC-008)
  assert.doesNotMatch(diagram, /\n\s{4}RECURRING_OCCURRENCES\s+\{/);
  // 予算は改定履歴と内訳だけを持ち、月ごとの予算行・実績を保存しない (BUD-005)
  assert.match(diagram, /GROUPS \|\|--o\{ BUDGET_REVISIONS/);
  assert.match(diagram, /BUDGET_REVISIONS \|\|--o\{ BUDGET_CATEGORY_LIMITS/);
  assert.match(diagram, /CATEGORIES \|\|--o\{ BUDGET_CATEGORY_LIMITS/);
  assert.doesNotMatch(diagram, /\n\s{4}BUDGET_MONTHS\s+\{/);
});
