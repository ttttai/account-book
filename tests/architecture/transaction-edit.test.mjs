import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("編集・削除・復元のDB関数を認証・認可・楽観的ロック付きで定義する", async () => {
  const migration = await read(
    "supabase/migrations/202608300001_transaction_edit_delete_restore.sql",
  );

  for (const fn of [
    "update_expense_transaction",
    "delete_transaction",
    "restore_transaction",
  ]) {
    assert.match(migration, new RegExp(`public\\.${fn}`, "i"));
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+?to authenticated`, "i"),
    );
  }

  assert.match(migration, /security definer/i);
  assert.match(migration, /is_allowed_google_identity/i);
  assert.match(migration, /is_active_group_member/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /raise serialization_failure/i);
  assert.match(migration, /raise no_data_found/i);
  assert.match(migration, /interval '30 days'/i);
  assert.match(migration, /allocation_total <> p_amount_minor/i);
  // 論理削除である（DELETE文で取引本体を消さない）
  assert.doesNotMatch(migration, /delete from public\.transactions/i);
  assert.doesNotMatch(migration, /grant update on table public\.transactions/i);
});

test("編集・削除・復元のDB/RLS integration testを実行対象に含める", async () => {
  const runner = await read("tests/integration/run-local.sql");
  assert.match(runner, /transaction-edit-delete-restore-local\.sql/);

  const integration = await read(
    "tests/integration/transaction-edit-delete-restore-local.sql",
  );
  assert.match(integration, /40001/);
  assert.match(integration, /P0002/);
  assert.match(integration, /42501/);
  assert.match(integration, /interval '31 days'/);
});

test("編集・削除・復元のquery/commandをserver-only境界へ隔離する", async () => {
  const sources = await Promise.all(
    [
      "src/modules/transactions/application/get-expense-for-edit.ts",
      "src/modules/transactions/application/update-expense.ts",
      "src/modules/transactions/application/delete-transaction.ts",
      "src/modules/transactions/application/restore-transaction.ts",
      "src/modules/transactions/application/list-recoverable-transactions.ts",
    ].map(read),
  );

  for (const source of sources) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }

  const [, update, remove, restore, list] = sources;
  assert.match(update, /update_expense_transaction/);
  assert.match(remove, /delete_transaction/);
  assert.match(restore, /restore_transaction/);
  // 競合はCONFLICTとして呼び出し側へ区別して返す
  assert.match(update, /40001/);
  assert.match(remove, /40001/);
  assert.match(restore, /40001/);
  // 復元一覧は30日以内へ限定する
  assert.match(list, /30/);
});

test("編集・復元の画面routeと導線を提供する", async () => {
  const editPage = await read(
    "src/app/groups/[groupId]/transactions/[transactionId]/edit/page.tsx",
  );
  assert.match(editPage, /getExpenseForEdit/);
  assert.match(editPage, /redirect\(`\/login\?next=/);

  const deletedPage = await read(
    "src/app/groups/[groupId]/transactions/deleted/page.tsx",
  );
  assert.match(deletedPage, /listRecoverableTransactions/);

  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");
  assert.match(settings, /transactions\/deleted/);

  // 日別取引sheetと履歴の行から編集画面へ遷移できる
  const dayExplorer = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );
  assert.match(dayExplorer, /transactions\/\$\{[^}]+\}\/edit/);
  const historyList = await read(
    "src/modules/history/presentation/history-list.tsx",
  );
  assert.match(historyList, /\/edit/);
});

test("編集フォームは楽観的ロックversionを保持し競合を案内する", async () => {
  const form = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );
  assert.match(form, /expectedVersion/);

  const actions = await read(
    "src/modules/transactions/presentation/actions.ts",
  );
  assert.match(actions, /updateExpenseAction/);
  assert.match(actions, /deleteTransactionAction/);
  assert.match(actions, /restoreTransactionAction/);
  assert.match(actions, /updateExpenseInputSchema/);
});
