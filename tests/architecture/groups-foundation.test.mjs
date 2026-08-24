import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("グループ所有テーブルをRLSで保護する", async () => {
  const migration = await read(
    "supabase/migrations/202608240002_groups_foundation.sql",
  );

  for (const table of ["groups", "group_members", "categories"]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`, "i"),
    );
  }

  assert.match(migration, /create or replace function public\.create_group/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(
    migration,
    /values \(new_group_id, current_user_id, 'owner', 'active'/i,
  );
  const defaultCategories = [
    ["expense", "食費", "food", "utensils", 0],
    ["expense", "日用品", "daily", "basket", 1],
    ["expense", "住居", "home", "house", 2],
    ["expense", "光熱費", "utilities", "bolt", 3],
    ["expense", "交通", "transport", "train", 4],
    ["expense", "娯楽", "leisure", "ticket", 5],
    ["expense", "その他", "other", "ellipsis", 6],
    ["income", "給与", "salary", "wallet", 0],
    ["income", "臨時収入", "extra", "sparkles", 1],
    ["income", "その他", "other", "ellipsis", 2],
  ];
  for (const [type, name, color, icon, order] of defaultCategories) {
    assert.match(
      migration,
      new RegExp(`'${type}', '${name}', '${color}', '${icon}', ${order}`),
    );
  }
  assert.match(migration, /revoke all on function public\.create_group/i);
  assert.match(migration, /grant execute on function public\.create_group/i);
});

test("グループqueryとcommandをserver-only境界へ隔離する", async () => {
  const query = await read("src/modules/groups/application/list-my-groups.ts");
  const command = await read("src/modules/groups/application/create-group.ts");

  for (const source of [query, command]) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }
});

test("App Routerはgroupsモジュールの公開境界だけを使う", async () => {
  const appPage = await read("src/app/app/page.tsx");
  const groupPage = await read("src/app/groups/[groupId]/page.tsx");

  assert.match(appPage, /@\/modules\/groups\/server/);
  assert.match(appPage, /@\/modules\/groups\/presentation/);
  assert.match(groupPage, /@\/modules\/groups\/server/);
  assert.doesNotMatch(
    appPage,
    /@\/modules\/groups\/(?:application|infrastructure)\//,
  );
});
