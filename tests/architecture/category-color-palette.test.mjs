import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// 承認済みパレット (AC-CAT-002-7): 既定9色を先、追加9色を後に並べる
const EXPECTED_COLORS = [
  "food",
  "daily",
  "home",
  "utilities",
  "transport",
  "leisure",
  "other",
  "salary",
  "extra",
  "orange",
  "olive",
  "mint",
  "sky",
  "indigo",
  "navy",
  "rose",
  "wine",
  "charcoal",
];

const MODULE_STYLESHEETS = [
  "src/modules/categories/presentation/categories.module.css",
  "src/modules/transactions/presentation/transactions.module.css",
  "src/modules/history/presentation/history.module.css",
  "src/modules/calendar/presentation/calendar.module.css",
  "src/modules/budgets/presentation/budgets.module.css",
  "src/modules/analytics/presentation/analytics.module.css",
];

function extractQuotedList(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} が見つからない`);
  const end = source.indexOf("]", start);
  return Array.from(
    source.slice(start, end).matchAll(/["']([a-z]+)["']/g),
    (match) => match[1],
  );
}

test("入力schemaのCATEGORY_COLORSは承認済み18色を同じ順序で定義する (AC-CAT-002-7)", async () => {
  const source = await read("src/modules/categories/domain/category-input.ts");
  const colors = extractQuotedList(source, "export const CATEGORY_COLORS = [");
  assert.deepEqual(colors, EXPECTED_COLORS);
});

test("パレット拡張migrationはcheck制約と更新関数を同じ18色へ差し替える (AC-CAT-002-7)", async () => {
  const migration = await read(
    "supabase/migrations/202609060001_category_color_palette.sql",
  );

  // 制約の差し替え（追加的変更のみ。テーブル作成・削除、データ移行はしない）
  assert.match(
    migration,
    /alter table public\.categories\s+drop constraint if exists categories_color/i,
  );
  assert.match(
    migration,
    /alter table public\.categories\s+add constraint categories_color check/i,
  );
  assert.doesNotMatch(migration, /create table|drop table|delete from/i);

  // 更新関数はowner/admin検証と色の拒否を維持する
  assert.match(
    migration,
    /create or replace function public\.update_group_category/i,
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /assert_category_manager/i);
  assert.match(migration, /invalid category color/i);
  assert.match(migration, /duplicate category name/i);

  // 制約と関数の許可リストがどちらも18色をすべて含む
  const checkClause = migration.match(
    /add constraint categories_color check \(([\s\S]*?)\);/i,
  );
  assert.ok(checkClause, "check制約の本文が必要");
  const functionClause = migration.match(
    /p_color not in \(([\s\S]*?)\)\s*then/i,
  );
  assert.ok(functionClause, "関数内の許可リストが必要");
  for (const clause of [checkClause[1], functionClause[1]]) {
    const tokens = Array.from(
      clause.matchAll(/'([a-z]+)'/g),
      (match) => match[1],
    );
    assert.deepEqual([...tokens].sort(), [...EXPECTED_COLORS].sort());
  }
});

test("色tokenの値はstyles.cssのdesign tokenとして1箇所で定義する (AC-CAT-002-7, NFR-MNT-010)", async () => {
  const styles = await read("src/app/styles.css");

  // 未知のtokenは既定色に留まる
  assert.match(
    styles,
    /\[data-category-color\]\s*\{[^}]*--category-color:\s*#[0-9a-f]{6}/is,
  );
  const definedValues = new Set();
  for (const token of EXPECTED_COLORS) {
    const rule = styles.match(
      new RegExp(
        `\\[data-category-color="${token}"\\]\\s*\\{[^}]*--category-color:\\s*(#[0-9a-f]{6})`,
        "is",
      ),
    );
    assert.ok(rule, `${token} の --category-color 定義が必要`);
    definedValues.add(rule[1].toLowerCase());
  }
  // 18色は互いに異なる値を持つ
  assert.equal(definedValues.size, EXPECTED_COLORS.length);
});

test("各機能のCSS Modulesはtokenごとの色値を再定義せずvar(--category-color)で描画する (NFR-MNT-010)", async () => {
  for (const path of MODULE_STYLESHEETS) {
    const styles = await read(path);
    assert.match(
      styles,
      /background:\s*var\(--category-color/,
      `${path} は --category-color を使う必要がある`,
    );
    assert.doesNotMatch(
      styles,
      /\[data-category-color="/,
      `${path} にtokenごとの色値を書いてはならない`,
    );
  }
});

test("カテゴリ管理のswatchは全色に色名labelを持ち、折り返して表示する (AC-CAT-002-7)", async () => {
  const management = await read(
    "src/modules/categories/presentation/category-management.tsx",
  );
  const styles = await read(
    "src/modules/categories/presentation/categories.module.css",
  );

  const labelsBlock = management.match(
    /const colorLabels[^=]*=\s*\{([\s\S]*?)\};/,
  );
  assert.ok(labelsBlock, "colorLabels の定義が必要");
  for (const token of EXPECTED_COLORS) {
    assert.match(
      labelsBlock[1],
      new RegExp(`\\b${token}:\\s*"[^"]+"`),
      `${token} の色名labelが必要`,
    );
  }
  assert.match(management, /aria-label=\{colorLabels\[color\]\}/);
  assert.match(management, /title=\{colorLabels\[color\]\}/);
  assert.match(styles, /\.category-color-options\s*\{[^}]*flex-wrap:\s*wrap/s);
});
