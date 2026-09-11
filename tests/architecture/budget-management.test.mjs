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

const migrationPath = "supabase/migrations/202609040001_budget_management.sql";

test("予算仕様を正本として承認記録に紐付ける (BUD-001〜BUD-010)", async () => {
  assert.equal(await exists("specs/13-budget-management.md"), true);

  const specification = await read("specs/13-budget-management.md");
  const requirements = await read("specs/01-product-requirements.md");
  const useCases = await read("specs/02-use-cases.md");
  const review = await read("specs/reviews/2026-09-04-budget-management.md");
  const readme = await read("specs/README.md");

  assert.match(specification, /状態: 承認済み/);
  assert.match(specification, /budget_revisions/);
  assert.match(specification, /budget_category_limits/);
  assert.match(specification, /calculateBudgetProgress/);
  assert.match(requirements, /^- `BUD-001`/m);
  assert.match(requirements, /^- `BUD-010`/m);
  assert.match(useCases, /^- `AC-BUD-001-1`/m);
  assert.match(useCases, /^- `AC-BUD-010-3`/m);
  assert.match(review, /状態: (承認済み|実装確認済み)/);
  assert.match(review, /関連ID: 追加: BUD-001〜BUD-010/);
  assert.match(readme, /13-budget-management\.md/);
});

test("予算テーブルをgroup_id付きRLSテーブルとして保護する (AC-BUD-001-2)", async () => {
  const migration = await read(migrationPath);

  for (const table of ["budget_revisions", "budget_category_limits"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, "i"));
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
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]{0,80}from public, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant select on table public\\.${table} to authenticated`,
        "i",
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(
        `grant (?:insert|update|delete)[^;]*public\\.${table}[^;]*authenticated`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `${table}[\\s\\S]{0,400}?is_active_group_member\\(group_id\\)`,
        "i",
      ),
    );
  }

  // 同じ開始月の改定は1件、内訳はグループ境界を複合外部キーで固定する
  assert.match(migration, /unique \(group_id, effective_month\)/i);
  for (const constraint of [
    "budget_category_limits_revision_group_fk",
    "budget_category_limits_category_group_fk",
  ]) {
    assert.match(migration, new RegExp(constraint));
  }
  // 停止改定は金額を持たず、有効改定は正の金額を持つ
  assert.match(migration, /status in \('active', 'disabled'\)/);
  assert.match(migration, /total_amount_minor between 1 and 9007199254740991/);
});

test("予算の更新はowner/adminと当月以降をDB関数で再確認する (AC-BUD-001-1, AC-BUD-001-3)", async () => {
  const migration = await read(migrationPath);

  for (const fn of ["set_group_budget", "disable_group_budget"]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${fn}\\(`),
    );
  }
  assert.match(
    migration,
    /has_active_group_role\(\s*target_group_id,\s*array\['owner', 'admin'\]/,
  );
  // グループのタイムゾーンから当月を求める（クライアントの日時を信用しない）
  assert.match(migration, /date_trunc\('month', timezone\(/);
  // カテゴリ合計とversionを検証する
  assert.match(migration, /category limit total exceeds budget/);
  assert.match(migration, /serialization_failure/);
  // security definerはsearch_pathを固定する
  const definerCount = (migration.match(/security definer/g) ?? []).length;
  const searchPathCount = (migration.match(/set search_path = ''/g) ?? [])
    .length;
  assert.ok(definerCount >= 3);
  assert.equal(searchPathCount, definerCount);
});

test("予算queryとcommandをserver-only境界へ隔離し、共有集計を再利用する (BUD-010)", async () => {
  const query = await read(
    "src/modules/budgets/application/get-group-budget.ts",
  );
  const revisions = await read(
    "src/modules/budgets/application/load-budget-revisions.ts",
  );
  const command = await read(
    "src/modules/budgets/application/save-group-budget.ts",
  );
  const server = await read("src/modules/budgets/server.ts");
  const overview = await read(
    "src/modules/analytics/application/get-analytics-overview.ts",
  );

  for (const source of [query, revisions, command, server]) {
    assert.match(source, /import "server-only"/);
    assert.doesNotMatch(source, /SERVICE_ROLE|unstable_cache|fetch\(/);
  }
  assert.match(query, /resolveGroupReadContext/);
  assert.match(query, /listMonthlyTransactions/);
  assert.match(query, /aggregateAnalyticsMonth/);
  assert.match(query, /calculateBudgetProgress/);
  assert.doesNotMatch(query, /\.from\("transactions"\)/);
  assert.match(command, /rpc\("set_group_budget"/);
  assert.match(command, /rpc\("disable_group_budget"/);
  // 分析概要は予算moduleの共有読み取りと純関数だけを使い、金額を再計算しない
  assert.match(overview, /loadAppliedBudgetRevision/);
  assert.match(overview, /calculateBudgetProgress/);
  assert.doesNotMatch(overview, /\.from\("budget_revisions"\)/);
  // 予算moduleは分析のserver境界を参照しない（循環依存を避ける）
  assert.doesNotMatch(query, /@\/modules\/analytics\/server/);
});

test("予算routeは公開境界、Promise searchParams、loading・error境界を持つ", async () => {
  const pagePath = "src/app/groups/[groupId]/budgets/page.tsx";
  assert.equal(await exists(pagePath), true);

  const page = await read(pagePath);
  const loading = await read("src/app/groups/[groupId]/budgets/loading.tsx");
  const error = await read("src/app/groups/[groupId]/budgets/error.tsx");
  const navigation = await read(
    "src/modules/groups/presentation/group-navigation.tsx",
  );
  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");

  assert.match(page, /@\/modules\/budgets\/server/);
  assert.match(page, /@\/modules\/budgets\/presentation/);
  assert.match(page, /searchParams: Promise/);
  assert.doesNotMatch(
    page,
    /@\/modules\/budgets\/(?:application|domain|infrastructure)\//,
  );
  assert.doesNotMatch(page, /fetch\([^)]+\/api\//);
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /^"use client";/m);
  assert.match(error, /reset\(\)/);
  // 設定ハブから遷移でき、現在地は「設定」
  assert.match(settings, /\/budgets/);
  assert.match(navigation, /`\$\{groupBase\}\/budgets`/);
});

test("予算スタイルを機能のCSS Modulesへ置き、横scrollと44px未満のタップ領域を避ける (AC-BUD-010-2)", async () => {
  const globalCss = await read("src/app/styles.css");
  const moduleCss = await read(
    "src/modules/budgets/presentation/budgets.module.css",
  );
  const overview = await read(
    "src/modules/budgets/presentation/budget-overview.tsx",
  );
  const editor = await read(
    "src/modules/budgets/presentation/budget-editor.tsx",
  );

  assert.match(overview, /import styles from ".\/budgets.module.css"/);
  assert.match(editor, /^"use client";/m);
  assert.doesNotMatch(globalCss, /\.budget-(?![a-zA-Z0-9_-]*page)/);
  assert.match(moduleCss, /min-width:\s*0;/);
  assert.match(moduleCss, /min-height:\s*44px;/);
  assert.doesNotMatch(moduleCss, /overflow-x:\s*(?:auto|scroll)/);
  assert.match(moduleCss, /@media \(min-width: 900px\)/);
  // 金額欄はOSの仮想キーボードを開かず、取引入力と共有するテンキーで入力する (AC-BUD-010-4)
  assert.match(editor, /inputMode="none"/);
  assert.doesNotMatch(editor, /inputMode="numeric"/);
  assert.match(editor, /@\/modules\/transactions\/presentation/);
  assert.match(editor, /AmountKeypad/);
  assert.match(editor, /appendAmountDigit/);
  assert.match(editor, /removeLastAmountDigit/);
  assert.match(moduleCss, /scroll-margin-bottom/);
  // 金額欄は表示だけを3桁区切りにし、区切りなしの整数をhidden inputで送る。表示用inputはnameを持たない (AC-BUD-010-5)
  assert.match(editor, /value=\{formatAmountExpression\(value\)\}/);
  assert.match(editor, /stripAmountGrouping\(/);
  assert.match(editor, /name=\{name\}[\s\S]{0,40}type="hidden"/);
  assert.doesNotMatch(editor, /inputMode="none"(?:(?!\/>)[\s\S])*name=/);
  assert.doesNotMatch(editor, /Intl\./);
});

test("予算はRoute Handlerと内部APIを追加しない", async () => {
  assert.equal(await exists("src/app/api/v1/groups/[groupId]/budgets"), false);
});
