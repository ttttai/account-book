import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("カテゴリ管理migrationはowner/admin検証付きsecurity definer関数だけを追加する", async () => {
  const migration = await read(
    "supabase/migrations/202608290002_category_management.sql",
  );

  for (const routine of [
    "add_group_category",
    "rename_group_category",
    "reorder_group_categories",
    "archive_group_category",
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${routine}`, "i"),
    );
  }

  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /has_active_group_role/i);
  assert.match(migration, /array\['owner', 'admin'\]/i);
  assert.match(migration, /insufficient_privilege/i);

  // 名称検証と重複拒否
  assert.match(migration, /btrim/i);
  assert.match(migration, /between 1 and 30/i);
  assert.match(migration, /duplicate category name/i);

  // 順序検証（欠落・重複・混入の拒否）と原子的な並び替え
  assert.match(migration, /category order must cover all active categories/i);
  assert.match(migration, /duplicate category in order/i);
  assert.match(migration, /category order contains invalid category/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /with ordinality/i);

  // 冪等なアーカイブ
  assert.match(migration, /already_archived/i);

  // テーブル・外部キー・権限の変更をしない（関数追加のみ）
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /alter table/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on table/i);
});

test("カテゴリqueryとcommandをserver-only境界へ隔離する", async () => {
  const query = await read(
    "src/modules/categories/application/get-category-management.ts",
  );
  const commands = await Promise.all([
    read("src/modules/categories/application/add-category.ts"),
    read("src/modules/categories/application/rename-category.ts"),
    read("src/modules/categories/application/move-category.ts"),
    read("src/modules/categories/application/archive-category.ts"),
  ]);

  for (const source of [query, ...commands]) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }

  // 一覧queryはアーカイブ済みを除外し、member判定より後にカテゴリを読まない
  assert.match(query, /\.is\("archived_at", null\)/);
  const forbiddenIndex = query.indexOf('kind: "forbidden"');
  const categoriesIndex = query.indexOf('from("categories")');
  assert.ok(forbiddenIndex >= 0, "権限不足状態を返す分岐が必要");
  assert.ok(categoriesIndex >= 0, "カテゴリ一覧の取得が必要");
  assert.ok(
    forbiddenIndex < categoriesIndex,
    "member判定より前にカテゴリデータを取得してはならない",
  );

  const serverEntry = await read("src/modules/categories/server.ts");
  assert.match(serverEntry, /import "server-only"/);
});

test("カテゴリServer ActionはFormDataを検証して認可済みcommandだけを呼ぶ", async () => {
  const action = await read("src/modules/categories/presentation/actions.ts");

  assert.match(action, /"use server"/);
  assert.match(action, /addCategorySchema\.safeParse/);
  assert.match(action, /renameCategorySchema\.safeParse/);
  assert.match(action, /moveCategorySchema\.safeParse/);
  assert.match(action, /archiveCategorySchema\.safeParse/);
  assert.match(action, /revalidatePath/);
  assert.doesNotMatch(
    action,
    /formData\.get\(["'](?:userId|role|memberId|sortOrder)/,
  );
});

test("App Routerはcategoriesモジュールの公開境界だけを使い権限不足状態を表示する", async () => {
  const page = await read("src/app/groups/[groupId]/categories/page.tsx");

  assert.match(page, /@\/modules\/categories\/server/);
  assert.match(page, /@\/modules\/categories\/presentation/);
  assert.doesNotMatch(
    page,
    /@\/modules\/categories\/(?:application|domain|infrastructure)\//,
  );
  assert.match(page, /getCurrentProfile\(\)/);
  assert.match(page, /redirect\([^)]+login/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /"forbidden"/);
  assert.match(page, /権限がありません/);

  // loading・error境界を用意する
  await read("src/app/groups/[groupId]/categories/loading.tsx");
  const errorBoundary = await read(
    "src/app/groups/[groupId]/categories/error.tsx",
  );
  assert.match(errorBoundary, /"use client"/);
});

test("カテゴリ操作は44px以上のタップ領域を持つform submitとして提供する", async () => {
  const management = await read(
    "src/modules/categories/presentation/category-management.tsx",
  );
  const styles = await read(
    "src/modules/categories/presentation/categories.module.css",
  );

  assert.match(management, /<form\s/);
  assert.match(management, /name="direction"/);
  assert.match(management, /<details/);
  assert.match(
    styles,
    /\.category-row-actions (?:button|.*)\s*{[\s\S]*?min-height:\s*(?:44|4[5-9]|[5-9]\d)px/,
  );
  assert.match(
    styles,
    /\.category-move-button\s*{[\s\S]*?min-width:\s*(?:44|4[5-9]|[5-9]\d)px/,
  );
});
