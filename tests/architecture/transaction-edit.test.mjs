import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("編集・削除のDB関数を認証・認可・楽観的ロック付きで定義する", async () => {
  const migration = await read(
    "supabase/migrations/202608310001_transaction_edit_delete.sql",
  );

  for (const fn of ["update_expense_transaction", "delete_transaction"]) {
    assert.match(migration, new RegExp(`public\\.${fn}`, "i"));
    assert.match(
      migration,
      new RegExp(
        `grant execute on function public\\.${fn}[\\s\\S]+?to authenticated`,
        "i",
      ),
    );
  }

  assert.match(migration, /security definer/i);
  assert.match(migration, /is_allowed_google_identity/i);
  assert.match(migration, /is_active_group_member/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /raise serialization_failure/i);
  assert.match(migration, /raise no_data_found/i);
  assert.match(migration, /allocation_total <> p_amount_minor/i);
  // 削除は本体と負担行の物理削除であり、復元機能は提供しない (R-050)
  assert.match(migration, /delete from public\.transactions/i);
  assert.match(migration, /delete from public\.transaction_allocations/i);
  assert.doesNotMatch(migration, /restore_transaction/i);
  // 直接のtable操作権限は付与しない
  assert.doesNotMatch(
    migration,
    /grant (update|delete) on table public\.transactions/i,
  );
});

test("編集・削除のDB/RLS integration testを実行対象に含める", async () => {
  const runner = await read("tests/integration/run-local.sql");
  assert.match(runner, /transaction-edit-delete-local\.sql/);

  const integration = await read(
    "tests/integration/transaction-edit-delete-local.sql",
  );
  assert.match(integration, /40001/);
  assert.match(integration, /P0002/);
  assert.match(integration, /42501/);
  // 物理削除と再送の冪等性を検証する
  assert.match(integration, /削除で取引本体を物理削除する/);
  assert.match(integration, /削除の再送は冪等に成功する/);
  assert.doesNotMatch(integration, /restore_transaction/);
});

test("編集・削除のquery/commandをserver-only境界へ隔離する", async () => {
  const sources = await Promise.all(
    [
      "src/modules/transactions/application/get-expense-for-edit.ts",
      "src/modules/transactions/application/update-expense.ts",
      "src/modules/transactions/application/delete-transaction.ts",
    ].map(read),
  );

  for (const source of sources) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }

  const [, update, remove] = sources;
  assert.match(update, /update_expense_transaction/);
  assert.match(remove, /delete_transaction/);
  // 競合・対象なし・検証エラーは共有のSQLSTATE変換で区別して返す
  const errorMapper = await read(
    "src/modules/transactions/application/command-error.ts",
  );
  assert.match(errorMapper, /40001/);
  assert.match(errorMapper, /P0002/);
  for (const source of [update, remove]) {
    assert.match(source, /mapTransactionCommandError/);
  }
});

test("編集の画面routeと導線を提供し、復元画面を持たない", async () => {
  const editPage = await read(
    "src/app/groups/[groupId]/transactions/[transactionId]/edit/page.tsx",
  );
  assert.match(editPage, /getExpenseForEdit/);
  assert.match(editPage, /redirect\(`\/login\?next=/);

  // 日別取引sheetと履歴の行から編集画面へ遷移できる
  const dayExplorer = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );
  assert.match(dayExplorer, /transactions\/\$\{[^}]+\}\/edit/);
  const historyList = await read(
    "src/modules/history/presentation/history-list.tsx",
  );
  assert.match(historyList, /\/edit/);

  // 復元機能は提供しない (R-050)
  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");
  assert.doesNotMatch(settings, /transactions\/deleted/);
  await assert.rejects(
    read("src/app/groups/[groupId]/transactions/deleted/page.tsx"),
  );
});

test("編集フォームは楽観的ロックversionを保持し、削除は元に戻せないことを確認させる", async () => {
  const form = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );
  assert.match(form, /expectedVersion/);

  const actions = await read(
    "src/modules/transactions/presentation/actions.ts",
  );
  assert.match(actions, /updateExpenseAction/);
  assert.match(actions, /deleteTransactionAction/);
  assert.match(actions, /updateExpenseInputSchema/);
  assert.doesNotMatch(actions, /restoreTransactionAction/);

  const deleteForm = await read(
    "src/modules/transactions/presentation/delete-transaction-form.tsx",
  );
  assert.match(deleteForm, /元に戻せません/);
  assert.doesNotMatch(deleteForm, /復元/);
});
